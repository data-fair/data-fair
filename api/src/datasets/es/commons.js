// Logic shared across all of most search and aggregation routes

import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import queryParser from 'lucene-query-parser'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import truncateMiddle from 'truncate-middle'
import truncateHTML from 'truncate-html'
import { marked } from 'marked'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { prepareThumbnailUrl } from '../../misc/utils/thumbnails.js'
import * as tiles from '../utils/tiles.js'
import * as geo from '../utils/geo.js'
import { geojsonToWKT } from '@terraformer/wkt'
import capabilities from '../../../contract/capabilities.js'
import turfDistance from '@turf/distance'
import memoize from 'memoizee'

dayjs.extend(utc)
dayjs.extend(timezone)

// From a property in data-fair schema to the property in an elasticsearch mapping
export const esProperty = prop => {
  const capabilities = prop['x-capabilities'] || {}
  // Add inner text field to almost everybody so that even dates, numbers, etc can be matched textually as well as exactly
  const innerFields = {}
  if (capabilities.textStandard !== false) {
    // more "raw" analysis good to boost more exact matches and for wildcard queries
    innerFields.text_standard = { type: 'text', analyzer: 'standard' }
  }
  let esProp = {}
  const index = capabilities.index !== false
  const values = capabilities.values !== false
  if (prop.type === 'object') esProp = { type: 'object', enabled: index }
  if (prop.type === 'integer') esProp = { type: 'long', fields: innerFields, index, doc_values: values }
  if (prop.type === 'number') esProp = { type: 'double', fields: innerFields, index, doc_values: values }
  if (prop.type === 'boolean') esProp = { type: 'boolean', index, doc_values: values }
  if (prop.type === 'string' && prop.format === 'date-time') esProp = { type: 'date', fields: innerFields, index, doc_values: values }
  if (prop.type === 'string' && prop.format === 'date') esProp = { type: 'date', fields: innerFields, index, doc_values: values }
  // uri-reference and full text fields are managed in the same way from now on, because we want to be able to aggregate on small full text fields
  if (prop.type === 'string' && (prop.format === 'uri-reference' || !prop.format)) {
    const textFieldData = capabilities.textAgg
    if (capabilities.textStandard !== false) {
      innerFields.text_standard.fielddata = textFieldData
    }
    if (capabilities.text !== false) {
      // language based analysis for better recall with stemming, etc
      innerFields.text = { type: 'text', analyzer: config.elasticsearch.defaultAnalyzer, fielddata: textFieldData }
    }
    if (capabilities.insensitive !== false) {
      // handle case and diacritics for better sorting
      innerFields.keyword_insensitive = { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
    }
    if (capabilities.wildcard) {
      // support wildcard filters
      // TODO: depending on the cardinality of the field the wildcard inner field might not be relevant
      // https://www.elastic.co/fr/blog/find-strings-within-strings-faster-with-the-new-elasticsearch-wildcard-field
      innerFields.wildcard = { type: 'wildcard', doc_values: false }
    }
    esProp = { type: 'keyword', ignore_above: 200, fields: innerFields, index, doc_values: values }
  }
  // Do not index geometry, it will be copied and simplified in _geoshape
  if (prop['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    // Geometry can be passed serialized in a string, or as an object
    if (prop.type === 'string') {
      esProp = { type: 'keyword', index: false, doc_values: false }
    } else {
      esProp = { enabled: false }
    }
  }
  // Hardcoded calculated properties
  if (prop.key === '_geopoint') esProp = { type: 'geo_point' }
  if (prop.key === '_geoshape') {
    // if geometry is present, _geoshape will always be here too, but maybe not fully indexed dependeing on capabilities
    if (!prop['x-capabilities'] || prop['x-capabilities'].geoShape !== false) {
      esProp = { type: 'geo_shape' }
    } else {
      esProp = { enabled: false }
    }
  }
  if (prop.key === '_geocorners') esProp = { type: 'geo_point' }
  if (prop.key === '_i') esProp = { type: 'long' }
  if (prop.key === '_rand') esProp = { type: 'integer' }
  if (prop.key === '_id') return null

  return esProp
}

export const aliasName = dataset => {
  if (dataset.isVirtual) return dataset.descendants.map(id => `${config.indicesPrefix}-${id}`).join(',')
  if (dataset.draftReason) return `${config.indicesPrefix}_draft-${dataset.id}`
  return `${config.indicesPrefix}-${dataset.id}`
}

export const parseSort = (sortStr, fields, dataset) => {
  if (!sortStr) return []
  const result = []
  for (const s of sortStr.split(',')) {
    let key, order
    if (s.indexOf('-') === 0) {
      key = s.slice(1)
      order = 'desc'
    } else {
      key = s
      order = 'asc'
    }
    if (key.startsWith('_geo_distance:')) {
      if (!dataset.bbox) throw httpError(400, '"geo_distance" sorting cannot be used on this dataset. It is not geolocalized.')
      const [lon, lat] = key.replace('_geo_distance:', '').split(':')
      result.push({ _geo_distance: { _geopoint: { lon, lat }, order } })
      continue
    }

    if (!fields.concat(['_key', '_count', '_time', 'metric', '_i', '_rand', '_score']).includes(key)) {
      throw httpError(400, `Impossible de trier sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    }
    const field = dataset.schema.find(f => f.key === key)
    const capabilities = (field && field['x-capabilities']) || {}
    if (capabilities.values === false && capabilities.insensitive === false) {
      throw httpError(400, `Impossible de trier sur le champ ${key}. La fonctionnalité "Triable et groupable" n'est pas activée dans la configuration technique du champ.`)
    }
    if (capabilities.insensitive !== false && field && field.type === 'string' && (field.format === 'uri-reference' || !field.format)) {
      // ignore_unmapped is necessary to maintain compatibility with older indices
      result.push({ [key + '.keyword_insensitive']: { order, unmapped_type: 'long' } })
    }
    if (capabilities.values !== false) {
      result.push({ [key]: { order } })
    }
  }

  return result
}

export const parseOrder = (sortStr, fields, dataset) => {
  const sort = parseSort(sortStr, fields, dataset)
  return sort.map(s => {
    const key = Object.keys(s)[0]
    return { [key]: s[key].order }
  })
}

// Check that a query_string query (lucene syntax)
// does not try to use fields outside the current schema
const capabilitiesSuffixes = [
  ['.text', 'text'],
  ['.text_standard', 'textStandard'],
  ['.keyword_insensitive', 'insensitive'],
  ['.wildcard', 'wildcard']
]
function checkQuery (query, schema, esFields, currentField) {
  if (typeof query === 'string') {
    // lucene-query-parser as a bug where it doesn't accept escaped quotes inside quotes
    if (process.env.NODE_ENV === 'test' && query === '(siret:"test \\" failure")') {
      // special test case to check error management
    } else {
      query = query.replace(/\\"/g, '')
    }

    try {
      query = queryParser.parse(query)
    } catch (err) {
      throw httpError(400, `<p>Impossible d'effectuer cette recherche, la syntaxe du paramètre "qs" n'est pas respectée :</p>
 <ul>
  <li>requête : ${query}</li>
  <li>erreur : ${err.message}</li>
</ul>`)
    }
  }
  query.field = query.field && query.field.replace(/\\/g, '')
  if (query.field === '<implicit>' && currentField) query.field = currentField
  if (query.field === '_exists_') {
    const field = query.term.replace(/\\/g, '')
    if (!schema.find(p => p.key === field)) {
      throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}, il n'existe pas dans le jeu de données.`)
    }
    if (field !== '<implicit>' && !esFields.includes(field)) {
      throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}. La fonctionnalité "${capabilities.properties.index.title}" n'est pas activée dans la configuration technique du champ.`)
    }
  } else if (query.field && query.field !== '<implicit>' && !esFields.includes(query.field)) {
    const suffix = capabilitiesSuffixes.find(cs => query.field.endsWith(cs[0]))
    if (suffix) {
      if (!schema.find(p => p.key + suffix[0] === query.field)) {
        throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}, il n'existe pas dans le jeu de données.`)
      }
      throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}. La fonctionnalité "${capabilities.properties[suffix[1]]?.title}" n'est pas activée dans la configuration technique du champ.`)
    } else {
      if (!schema.find(p => p.key === query.field)) {
        throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}, il n'existe pas dans le jeu de données.`)
      }
      throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}. La fonctionnalité "${capabilities.properties.index.title}" n'est pas activée dans la configuration technique du champ.`)
    }
  }
  if (query.term && (query.term.startsWith('*') || query.term.startsWith('?')) && (!query.field || !query.field.endsWith('.wildcard'))) {
    // throw httpError(400, `Impossible de faire une recherche de suite de caractères sans préfixe sur le champ ${query.field}, la fonctionnalité n'est pas activée.`)
    // console.warn(`Impossible de faire une recherche de suite de caractères sans préfixe sur le champ ${query.field}, la fonctionnalité n'est pas activée.`)
  }
  if (query.left) checkQuery(query.left, schema, esFields, query.field)
  if (query.right) checkQuery(query.right, schema, esFields, query.field)
}

/**
 *
 * @param {any} prop
 * @param {string} capability
 */
export const requiredCapability = (prop, filterName, capability = 'index') => {
  const propCapabilities = prop['x-capabilities'] ?? {}
  if (propCapabilities[capability] === false || (['wildcard', 'textAgg'].includes(capability) && propCapabilities[capability] !== true)) {
    throw httpError(400, `Impossible d'appliquer un filtre ${filterName} sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties[capability]?.title}" n'est pas activée dans la configuration technique du champ.`)
  }
}

export const getFilterableFields = memoize((dataset, hasQ, qFields) => {
  // query and simple query string for a lot of functionalities in a simple exposition (too open ??)
  // const multiFields = [...fields].concat(dataset.schema.filter(f => f.type === 'string').map(f => f.key + '.text'))
  const searchFields = []
  // const wildcardFields = []
  const qSearchFields = []
  const qStandardFields = []
  const qWildcardFields = []
  const esFields = []

  for (const f of dataset.schema) {
    const capabilities = f['x-capabilities'] || []
    if (capabilities.index !== false) esFields.push(f.key)
    if (capabilities.text !== false) esFields.push(f.key + '.text')
    if (capabilities.textStandard !== false) esFields.push(f.key + '.text_standard')
    if (capabilities.insensitive !== false) esFields.push(f.key + '.keyword_insensitive')
    if (capabilities.wildcard) esFields.push(f.key + '.wildcard')

    if (f.key === '_id') {
      searchFields.push('_id')
      continue
    }

    const isQField = hasQ && f.key !== '_id' && (!qFields || qFields.includes(f.key))
    const esProp = esProperty(f)
    if (esProp.index !== false && esProp.enabled !== false && esProp.type === 'keyword') {
      searchFields.push(f.key)
      if (isQField) qSearchFields.push(f.key)
    }
    if (esProp.fields && (esProp.fields.text || esProp.fields.text_standard)) {
      // automatic boost of some special properties well suited for full-text search
      let suffix = ''
      if (f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label') suffix = '^3'
      if (f['x-refersTo'] === 'http://schema.org/description') suffix = '^2'
      if (f['x-refersTo'] === 'https://schema.org/DefinedTermSet') suffix = '^2'

      if (esProp.fields.text) {
        searchFields.push(f.key + '.text' + suffix)
        if (isQField) qSearchFields.push(f.key + '.text' + suffix)
      }
      if (esProp.fields.text_standard) {
        searchFields.push(f.key + '.text_standard' + suffix)
        if (isQField) {
          qSearchFields.push(f.key + '.text_standard' + suffix)
          qStandardFields.push(f.key + '.text_standard' + suffix)
        }
      }
      if (esProp.fields.wildcard) {
        // wildcardFields.push(f.key + '.wildcard')
        if (isQField) qWildcardFields.push(f.key + '.wildcard')
      }
    }
  }
  return { searchFields, qSearchFields, qStandardFields, qWildcardFields, esFields }
}, {
  profileName: 'getFilterableFields',
  primitive: true,
  normalizer: ([dataset, hasQ, qFields]) => {
    return `${dataset.id}:${dataset.finalizedAt}:${!!hasQ}:${qFields ? qFields.join(',') : ''}`
  },
  max: 10000,
  maxAge: 1000 * 60 * 60, // 1 hour
})

export const prepareQuery = (dataset, query, qFields, sqsOptions = {}, qsAsFilter) => {
  const esQuery = {}
  qFields = qFields || (query.q_fields && query.q_fields.split(','))

  // Valid "total" value
  // TODO: make it optional for perf on large queries ?
  esQuery.track_total_hits = true

  // Pagination
  esQuery.size = query.size ? Number(query.size) : 12
  if (esQuery.size > config.elasticsearch.maxPageSize) throw httpError(400, `"size" cannot be more than ${config.elasticsearch.maxPageSize}`)
  if (query.after) {
    try {
      esQuery.search_after = JSON.parse(`[${query.after}]`)
    } catch (err) {
      throw httpError(400, '"after" parameter is malformed')
    }
  } else {
    esQuery.from = (query.page ? Number(query.page) - 1 : 0) * esQuery.size
  }
  if ((esQuery.from + esQuery.size) > config.elasticsearch.maxPageSize) throw httpError(400, `"size * page" cannot be more than ${config.elasticsearch.maxPageSize}`)

  // Select fields to return
  const fields = dataset.schema.map(f => f.key)
  // do not include by default heavy calculated fields used for indexing geo data
  esQuery._source = (query.select && query.select !== '*')
    ? query.select.split(',')
    : fields.filter(key => key !== '_geoshape' && key !== '_geocorners')
  const unknownField = esQuery._source.find(s => !fields.includes(s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données.`)

  // Others are included depending on the context
  if (query.thumbnail) {
    const imageField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    if (imageField && query.select && !esQuery._source.includes(imageField.key)) {
      esQuery._source.push(imageField.key)
    }
  }

  // Sort by list of fields (prefixed by - for descending sort)
  esQuery.sort = query.sort ? parseSort(query.sort, fields, dataset) : []
  // implicitly sort by score after other criteria
  if (!esQuery.sort.some(s => !!s._score) && query.q) esQuery.sort.push('_score')
  // if there is a geo_distance filter, apply a default _geo_distance sort
  if ((query.geo_distance ?? query._c_geo_distance) && !esQuery.sort.some(s => !!s._geo_distance)) {
    const [lon, lat] = (query.geo_distance ?? query._c_geo_distance).split(/[,:]/)
    esQuery.sort.push({ _geo_distance: { _geopoint: { lon, lat }, order: 'asc' } })
  }
  // every other things equal, sort by original line order
  // this is very important as it provides a tie-breaker for search_after pagination
  if (fields.includes('_updatedAt')) {
    if (!esQuery.sort.some(s => !!s._updatedAt)) esQuery.sort.push({ _updatedAt: 'desc' })
    if (!esQuery.sort.some(s => !!s._i)) esQuery.sort.push({ _i: 'desc' })
  } else {
    if (!esQuery.sort.some(s => !!s._i)) esQuery.sort.push('_i')
  }
  if (dataset.isVirtual) {
    // _i is not a good enough tie-breaker in the case of virtual datasets
    if (!esQuery.sort.some(s => !!s._rand)) esQuery.sort.push('_rand')
  }

  // Simple highlight management
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-highlighting.html
  if (query.highlight) {
    esQuery.highlight = { fields: {}, no_match_size: 300, fragment_size: 100, pre_tags: ['<em class="highlighted">'], post_tags: ['</em>'] }
    for (const key of query.highlight.split(',')) {
      if (!fields.includes(key)) throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      esQuery.highlight.fields[key + '.text'] = {}
      esQuery.highlight.fields[key + '.text_standard'] = {}
    }
  }

  const filter = []
  const must = []
  const should = []
  const mustNot = []

  // Enforced static filters from virtual datasets
  if (dataset.virtual && dataset.virtual.filters) {
    for (const f of dataset.virtual.filters) {
      if (f.values && f.values.length) {
        if (f.values.length === 1) filter.push({ term: { [f.key]: f.values[0] } })
        else filter.push({ terms: { [f.key]: f.values } })
      }
    }
  }

  // Envorced filter in case of rest datasets with line ownership
  if (query.owner) {
    filter.push({ term: { _owner: query.owner } })
  }

  if (query.account) {
    const accountField = dataset.schema.find(f => f['x-refersTo'] === 'https://github.com/data-fair/lib/account')
    if (!accountField) throw httpError(400, 'Impossible de filtrer sur le concept compte, il n\'est pas défini sur le dataset.')
    filter.push({ terms: { [accountField.key]: query.account.split(',') } })
  }

  let q = query.q ?? query._c_q
  if (q) q = q.trim()

  if (q || query.qs) {
    const { searchFields, qSearchFields, qStandardFields, qWildcardFields, esFields } = getFilterableFields(dataset, q, qFields)
    if (query.qs) {
      checkQuery(query.qs, dataset.schema, esFields)
      const qs = { query_string: { query: query.qs, fields: searchFields } }
      if (qsAsFilter) filter.push(qs)
      else must.push(qs)
    }
    if (q) {
      const qBool = { bool: { should: [], minimum_should_match: 1 } }
      const qShould = qBool.bool.should
      if (query.q_mode === 'complete') {
      // "complete" mode, we try to accomodate for most cases and give the most intuitive results
      // to a search query where the user might be using a autocomplete type control

        // if the user didn't define wildcards himself, we use wildcard to create a "startsWith" functionality
        // this is performed on the innerfield that uses standard analysis, as language stemming doesn't work well in this case
        // we also perform a contains filter if some wildcard functionnality is activate
        if (!q.includes('*') && !q.includes('?')) {
          if (qStandardFields.length) {
            qShould.push({ simple_query_string: { query: `${q}*`, fields: qStandardFields, ...sqsOptions } })
          }
          if (qWildcardFields.length) {
            qShould.push({ query_string: { query: `*${q}*`, fields: qWildcardFields, ...sqsOptions } })
          }
        }
        // if the user submitted a multi word query and didn't use quotes
        // we add some quotes to boost results with sequence of words
        if (qSearchFields.length && q.includes(' ') && !q.includes('"')) {
          qShould.push({ simple_query_string: { query: `"${q}"`, fields: qSearchFields, ...sqsOptions } })
        }
        if (qSearchFields.length) {
          qShould.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
        }
      } else {
        // default "simple" mode uses ES simple query string directly
        // only tuning is that we match both on stemmed and raw inner fields to boost exact matches
        if (qSearchFields.length) {
          qShould.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
        }
        if (qStandardFields.length) {
          qShould.push({ simple_query_string: { query: q, fields: qStandardFields, ...sqsOptions } })
        }
      }
      must.push(qBool)
    }
  }
  for (const queryKey of Object.keys(query)) {
    const filterSuffix = ['_in', '_nin', '_eq', '_neq', '_gt', '_lt', '_gte', '_lte', '_search', '_contains', '_starts'].find(suffix => queryKey.endsWith(suffix))
    if (!filterSuffix) continue
    let prop
    if (queryKey.startsWith('_c_')) {
      const conceptId = queryKey.slice(3, queryKey.length - filterSuffix.length)
      prop = dataset.schema.find(p => p['x-concept'] && p['x-concept'].primary && p['x-concept'].id === conceptId)
      // concept filters can be applied to any dataset by dashboards, they should be ignored if no match is found
      if (!prop) continue
    } else {
      const propKey = queryKey.slice(0, queryKey.length - filterSuffix.length)
      prop = dataset.schema.find(p => p.key === propKey)
      if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${propKey}, il n'existe pas dans le jeu de données.`)
    }

    if (filterSuffix === '_in') {
      requiredCapability(prop, filterSuffix)
      try {
        const values = query[queryKey].startsWith('"') ? JSON.parse(`[${query[queryKey]}]`) : query[queryKey].split(',')
        filter.push({ terms: { [prop.key]: values } })
      } catch (err) {
        throw httpError(400, `"${queryKey}" parameter is malformed`)
      }
    }
    if (filterSuffix === '_nin') {
      requiredCapability(prop, filterSuffix)
      try {
        const values = query[queryKey].startsWith('"') ? JSON.parse(`[${query[queryKey]}]`) : query[queryKey].split(',')
        filter.push({ bool: { must_not: { terms: { [prop.key]: values } } } })
      } catch (err) {
        throw httpError(400, `"${queryKey}" parameter is malformed`)
      }
    }
    if (filterSuffix === '_eq') {
      requiredCapability(prop, filterSuffix)
      filter.push({ term: { [prop.key]: query[queryKey] } })
    }
    if (filterSuffix === '_neq') {
      requiredCapability(prop, filterSuffix)
      filter.push({ bool: { must_not: { term: { [prop.key]: query[queryKey] } } } })
    }
    if (filterSuffix === '_gt') {
      // TODO: check if this filter required a "index" capability or "values"
      requiredCapability(prop, filterSuffix)
      filter.push({ range: { [prop.key]: { gt: query[queryKey] } } })
    }
    if (filterSuffix === '_gte') {
      requiredCapability(prop, filterSuffix)
      filter.push({ range: { [prop.key]: { gte: query[queryKey] } } })
    }
    if (filterSuffix === '_lt') {
      requiredCapability(prop, filterSuffix)
      filter.push({ range: { [prop.key]: { lt: query[queryKey] } } })
    }
    if (filterSuffix === '_lte') {
      requiredCapability(prop, filterSuffix)
      filter.push({ range: { [prop.key]: { lte: query[queryKey] } } })
    }
    if (filterSuffix === '_starts') {
      requiredCapability(prop, filterSuffix)
      filter.push({ prefix: { [prop.key]: query[queryKey] } })
    }
    if (filterSuffix === '_contains') {
      requiredCapability(prop, filterSuffix, 'wildcard')
      filter.push({ wildcard: { [`${prop.key}.wildcard`]: `*${query[queryKey]}*` } })
    }
    if (filterSuffix === '_search') {
      let subfield = 'text_standard'
      if (prop['x-capabilities']?.text !== false) subfield = 'text'
      requiredCapability(prop, filterSuffix, 'textStandard')
      must.push({ match: { [`${prop.key}.${subfield}`]: query[queryKey] } })
    }
  }

  if (query.date_match ?? query._c_date_match) {
    const dateMatch = query.date_match ?? query._c_date_match
    const dateField = dataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/Date')
    const startDateField = dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/startDate') ?? dateField
    const endDateField = dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/endDate') ?? dateField
    if (!startDateField || !endDateField) {
      if (query.date_match) {
        throw httpError(400, '"date_match" ne peut pas être utilisé sur ce jeu de données.')
      } else {
        // silently ignore filters prefixed by _c_ if they are not used
      }
    } else {
      let dates = dateMatch.split(',')
      if (dates.length === 1) dates = [dates[0], dates[0]]
      const tz = startDateField.timeZone || config.defaultTimeZone
      const startDate = (dates[0].length === 10 && dayjs(dates[0], 'YYYY-MM-DD', true).isValid()) ? dayjs(dates[0]).tz(tz, true).startOf('day').toISOString() : dates[0]
      const endDate = (dates[1].length === 10 && dayjs(dates[1], 'YYYY-MM-DD', true).isValid()) ? dayjs(dates[1]).tz(tz, true).endOf('day').toISOString() : dates[1]
      if (startDateField.key === endDateField.key) {
        const dateRange = {}
        if (startDate) dateRange.gte = startDate
        if (endDate) dateRange.lte = endDate
        filter.push({ range: { [startDateField.key]: dateRange } })
      } else {
        const outsideRange = []
        if (startDate) outsideRange.push({ range: { [endDateField.key]: { lt: startDate } } })
        if (endDate) outsideRange.push({ range: { [startDateField.key]: { gt: endDate } } })
        mustNot.push({ bool: { should: outsideRange } })
      }
    }
  }

  // bounding box filter to restrict results on geo zone: left,bottom,right,top
  const geoShapeProp = dataset.schema.find(p => p.key === '_geoshape')
  const geoShape = geoShapeProp && (!geoShapeProp['x-capabilities'] || geoShapeProp['x-capabilities'].geoShape !== false)
  const geoCornersProp = dataset.schema.find(p => p.key === '_geocorners')
  const geoCorners = geoCornersProp && (!geoCornersProp['x-capabilities'] || geoCornersProp['x-capabilities'].geoCorners !== false)
  if ((query.bbox || query.xyz) && !dataset.bbox) {
    throw httpError(400, '"bbox" filter cannot be used on this dataset. It is not geolocalized.')
  }
  if ((query.bbox || query._c_bbox || query.xyz) && dataset.bbox) {
    const bbox = getQueryBBOX(query, dataset)
    const esBoundingBox = { left: bbox[0], bottom: bbox[1], right: bbox[2], top: bbox[3] }
    // use geo_shape intersection instead geo_bounding_box in order to get even
    // partial geometries in tiles
    filter.push({
      geo_shape: {
        [geoShape ? '_geoshape' : (geoCorners ? '_geocorners' : '_geopoint')]: {
          relation: 'intersects',
          shape: {
            type: 'envelope',
            coordinates: [[esBoundingBox.left, esBoundingBox.top], [esBoundingBox.right, esBoundingBox.bottom]]
          }
        }
      }
    })
  }

  if (query.geo_distance ?? query._c_geo_distance) {
    if (!dataset.bbox) {
      if (query.geo_distance) {
        throw httpError(400, '"geo_distance" filter cannot be used on this dataset. It is not geolocalized.')
      } else {
        // silently ignore filters prefixed by _c_ if they are not used
      }
    } else {
      let [lon, lat, distance] = (query.geo_distance ?? query._c_geo_distance).split(/[,:]/)
      if (!distance || distance === '0') distance = '0m'
      lon = Number(lon)
      lat = Number(lat)
      if (geoShape && (distance === '0m' || distance === '0km')) {
        filter.push({
          geo_shape: {
            _geoshape: {
              relation: 'contains',
              shape: {
                type: 'point',
                coordinates: [lon, lat]
              }
            }
          }
        })
      } else {
        // TODO: use _geoshape after upgrading ES

        // distance of 0 is not accepted
        if (distance === '0m' || distance === '0km') distance = '1m'

        filter.push({
          geo_distance: {
            distance,
            _geopoint: { lat, lon }
          }
        })
      }
    }
  }

  const minimumShouldMatch = should.length ? 1 : 0
  esQuery.query = { bool: { filter, must, should, mustNot, minimum_should_match: minimumShouldMatch } }

  return esQuery
}

export const getQueryBBOX = (query) => {
  let bbox
  if (query.bbox ?? query._c_bbox) {
    bbox = (query.bbox ?? query._c_bbox).split(',').map(Number)
  } else if (query.xyz) {
    bbox = tiles.xyz2bbox(...query.xyz.split(',').map(Number))
  }
  if (bbox) {
    bbox[0] = geo.fixLon(bbox[0])
    bbox[2] = geo.fixLon(bbox[2])
  }
  return bbox
}

export const prepareResultItem = (hit, dataset, query, flatten, publicBaseUrl = config.publicUrl) => {
  const res = flatten(hit._source)
  res._score = hit._score
  if (dataset.schema.find(f => f.key === '_id')) {
    if (!query.select || query.select === '*' || query.select.split(',').includes('_id')) {
      res._id = hit._id
    }
  }
  if (query.highlight) {
    // return hightlight results and remove .text suffix of fields
    res._highlight = query.highlight.split(',')
      .reduce((a, key) => {
        // is it possible to merge these 2 instead of chosing one ?
        const textHighlight = (hit.highlight && hit.highlight[key + '.text']) || []
        const textStandardHighlight = (hit.highlight && hit.highlight[key + '.text_standard']) || []
        if (textStandardHighlight && textStandardHighlight.length && (textHighlight.length === 0 || !textHighlight[0].includes('<em class="highlighted">'))) {
          a[key] = textStandardHighlight
        } else {
          a[key] = textHighlight
        }
        return a
      }, {})
  }

  const imageField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
  if (query.thumbnail) {
    if (!imageField) throw httpError(400, 'Thumbnail management is only available if the "image" concept is associated to a field of the dataset.')
    if (res[imageField.key]) {
      let imageUrl = res[imageField.key]
      if (dataset.attachmentsAsImage) {
        imageUrl = imageUrl.replace(`${publicBaseUrl}/api/v1/datasets/${dataset.id}/attachments/`, '/attachments/')
        imageUrl = imageUrl.replace(`${config.publicUrl}/api/v1/datasets/${dataset.id}/attachments/`, '/attachments/')
      }
      const thumbnailId = Buffer.from(imageUrl).toString('hex')
      // TODO: generate a shorter url with _id when it is present and thumbnailId is very long ?
      res._thumbnail = prepareThumbnailUrl(`${publicBaseUrl}/api/v1/datasets/${dataset.id}/thumbnail/${encodeURIComponent(thumbnailId)}`, query.thumbnail, query.draft)
    }
  }

  if (query.draft && res._attachment_url) res._attachment_url += '?draft=true'

  // format markdown and sanitize it for XSS prevention
  // either using x-display=markdown info or implicitly for description
  const descriptionField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/description')?.key
  if (query.html === 'true') {
    for (const field of dataset.schema) {
      if ((field['x-display'] === 'markdown' || field.key === descriptionField) && res[field.key]) {
        res[field.key] = marked.parse(res[field.key]).trim()
        res[field.key] = sanitizeHtml(res[field.key])
      }
    }
  }

  // Truncate string results for faster previews
  if (query.truncate) {
    const linkField = dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/WebPage')
    const emailField = dataset.schema.find(f => f['x-refersTo'] === 'https://www.w3.org/2006/vcard/ns#email')
    const docField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')

    const truncate = Number(query.truncate)
    for (const key in res) {
      if (typeof res[key] !== 'string') continue
      if (descriptionField === key) continue
      if (imageField && imageField.key === key) continue
      if (linkField && linkField.key === key) continue
      if (emailField && emailField.key === key) continue
      if (docField && docField.key === key) continue
      if (key === '_thumbnail') continue
      if (key === '_highlight') continue
      if (key === '_id') continue
      if (key === '_geopoint') continue
      if (key === '_geoshape') continue
      if (key === '_attachment_url') continue
      const field = dataset.schema.find(f => f.key === key)
      if (field && field.separator) continue
      if (query.html === 'true' && (field['x-display'] === 'markdown' || field.key === descriptionField)) {
        res[key] = truncateHTML(res[key], truncate)
      } else {
        res[key] = truncateMiddle(res[key], truncate, 0, '...')
      }
    }
  }

  if (query.wkt === 'true') {
    const geometryField = dataset.schema.find(f => f['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry')
    if (geometryField && res[geometryField.key]) {
      const geometry = typeof res[geometryField.key] === 'string' ? JSON.parse(res[geometryField.key]) : res[geometryField.key]
      res[geometryField.key] = geojsonToWKT(geometry)
    }
    if (res._geoshape) res._geoshape = geojsonToWKT(res._geoshape)
  }

  if (res._geopoint && (query.geo_distance ?? query._c_geo_distance)) {
    const [lon, lat] = (query.geo_distance ?? query._c_geo_distance).split(/[,:]/)
    const [centerLat, centerLon] = res._geopoint.split(',')
    const distance = turfDistance([lon, lat], [centerLon, centerLat])
    res._geo_distance = distance * 1000
  }

  return res
}

// try to produce a somewhat readable error message from a structured error from elasticsearch
/**
 *
 * @param {any} err
 * @returns {{message: String, status: Number}}
 */
export const extractError = (err) => {
  const status = err.status ?? err.statusCode ?? 500
  if (typeof err === 'string') return { message: err, status }
  let errBody = (err.body && err.body.error) || (err.meta && err.meta.body && err.meta.body.error) || err.error
  if (!errBody && !!err.reason) errBody = err
  if (!errBody) {
    if (err.message) return { message: err.message, status }
    else return { message: JSON.stringify(err), status }
  }
  const parts = []
  if (errBody.reason) {
    parts.push(errBody.reason)
  }
  if (errBody.root_cause && errBody.root_cause.reason && !parts.includes(errBody.root_cause.reason)) {
    parts.push(errBody.root_cause.reason)
  }
  if (errBody.root_cause && errBody.root_cause[0] && errBody.root_cause[0].reason && !parts.includes(errBody.root_cause[0].reason)) {
    parts.push(errBody.root_cause[0].reason)
  }
  if (errBody.failed_shards && errBody.failed_shards[0] && errBody.failed_shards[0].reason) {
    const shardReason = errBody.failed_shards[0].reason
    if (shardReason.caused_by && shardReason.caused_by.reason && !parts.includes(shardReason.caused_by.reason)) {
      parts.push(shardReason.caused_by.reason)
    } else {
      const reason = shardReason.reason || shardReason
      if (!parts.includes(reason)) parts.push(reason)
    }
  }
  if (parts.includes('Time exceeded')) {
    return {
      message: 'Cette requête est trop longue, son traitement a été interrompu.',
      status: 504
    }
  }
  return { message: parts.join(' - '), status }
}

// cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
export const escapeFilter = (val) => {
  if (typeof val !== 'string') return val
  return [].map.call(val, (char) => {
    if (char === '+' ||
      char === '-' ||
      char === '&' ||
      char === '|' ||
      char === '!' ||
      char === '(' ||
      char === ')' ||
      char === '{' ||
      char === '}' ||
      char === '[' ||
      char === ']' ||
      char === '^' ||
      char === '"' ||
      char === '~' ||
      char === '*' ||
      char === '?' ||
      char === ':' ||
      char === '\\' ||
      char === '/'
    ) return '\\' + char
    else return char
  }).join('')
}
