// Logic shared across all of most search and aggregation routes

import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import queryParser from 'lucene-query-parser'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import truncateMiddle from 'truncate-middle'
import truncateHTML from 'truncate-html'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { prepareThumbnailUrl } from '../../misc/utils/thumbnails.ts'
import * as tiles from '../utils/tiles.ts'
import * as geo from '../utils/geo.ts'
import { geojsonToWKT } from '@terraformer/wkt'
import capabilities from '../../../contract/capabilities.js'
import turfDistance from '@turf/distance'
import { defaultMarked, vuetifyMarked } from '../../misc/utils/markdown.ts'
import {
  hasCapability,
  requiredCapability,
  esProperty as esPropertyPure,
  Q_SEARCH_FIELDS_THRESHOLD,
  isBoostEligible,
  hasManyQSearchFields,
  getFilterableFields,
  buildQClauses,
  FILTER_CAPABILITIES,
  getColumnFilters,
  columnOperationsHint,
  resolveExactKeywordTarget,
  resolveExistsFields,
  resolveRangeOrPrefixField,
  KEYWORD_IGNORE_ABOVE
} from './operations.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

// derived from the single source of truth — keep no second hardcoded list.
// order differs from the old array but is collision-free for endsWith detection
// (every suffix is underscore-prefixed, so none is a suffix-substring of another).
const filterSuffixes = Object.keys(FILTER_CAPABILITIES)

// thin wrapper around the pure helper to keep the existing single-arg call sites working —
// supplies the runtime analyzer from config so mapping creation behaves unchanged
export const esProperty = (prop: any) => esPropertyPure(prop, config.elasticsearch.defaultAnalyzer)

export { Q_SEARCH_FIELDS_THRESHOLD, isBoostEligible, hasManyQSearchFields, getFilterableFields }

export const aliasName = (dataset: any) => {
  if (dataset.isVirtual) return dataset.descendants.map((id: string) => `${config.indicesPrefix}-${id}`).join(',')
  if (dataset.draftReason) return `${config.indicesPrefix}_draft-${dataset.id}`
  return `${config.indicesPrefix}-${dataset.id}`
}

export const parseSort = (sortStr: string | undefined, fields: string[], dataset: any) => {
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
      // ignore_unmapped lets a virtual dataset mix geo and non-geo children:
      // rows from a child without geo mapping sort last instead of failing the query
      result.push({ _geo_distance: { _geopoint: { lon, lat }, order, ignore_unmapped: true } })
      continue
    }

    if (!fields.concat(['_key', '_count', '_time', 'metric', '_i', '_rand', '_score']).includes(key)) {
      throw httpError(400, `Impossible de trier sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    }
    const field = dataset.schema.find((f: any) => f.key === key)
    const capabilities = (field && field['x-capabilities']) || {}
    if (capabilities.values === false && capabilities.insensitive === false) {
      throw httpError(400, `Impossible de trier sur le champ ${key}. La fonctionnalité "Triable et groupable" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
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

// Check that a query_string query (lucene syntax)
// does not try to use fields outside the current schema
const capabilitiesSuffixes = [
  ['.text', 'text'],
  ['.text_standard', 'textStandard'],
  ['.keyword_insensitive', 'insensitive'],
  ['.wildcard', 'wildcard']
]
function checkQuery (query: any, schema: any[], esFields: string[], currentField?: string) {
  if (typeof query === 'string') {
    // lucene-query-parser as a bug where it doesn't accept escaped quotes inside quotes
    if (process.env.NODE_ENV === 'development' && query === '(siret:"test \\" failure")') {
      // special test case to check error management
    } else {
      query = query.replace(/\\"/g, '')
    }

    try {
      query = queryParser.parse(query)
    } catch (err) {
      throw httpError(400, `Impossible d'effectuer cette recherche, la syntaxe du paramètre "qs" n'est pas respectée : requête = "${query}", erreur = "${(err as Error).message}"`)
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
      throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${query.field}. La fonctionnalité "${(capabilities.properties as Record<string, any>)[suffix[1]]?.title}" n'est pas activée dans la configuration technique du champ.`)
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

export { hasCapability, requiredCapability, getColumnFilters }

// Collapse validation + query shaping shared by the buffered search(), searchStream and searchRaw — the
// three /lines entry points must never drift (same 400s, same cardinality agg / precision default).
export const applyCollapse = (esQuery: any, dataset: any, query: Record<string, any>): void => {
  if (!query.collapse) return
  const collapseField = dataset.schema.find((f: any) => f.key === query.collapse)
  if (!collapseField) {
    throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il n'existe pas dans le jeu de données.`)
  }
  if (collapseField.separator) {
    throw httpError(400, `Impossible d'utiliser "collapse" sur le champ ${query.collapse}, il est multivalué.`)
  }
  esQuery.collapse = { field: query.collapse }
  // number after which we accept that cardinality is approximative
  const precisionThreshold = Number(query.precision_threshold ?? '40000')
  esQuery.aggs = { totalCollapse: { cardinality: { field: query.collapse, precision_threshold: precisionThreshold } } }
}

export const prepareQuery = (dataset: any, query: Record<string, any>, qFields?: string[], sqsOptions: any = {}, qsAsFilter?: boolean, ignoreInvalidQS?: boolean) => {
  const esQuery: any = {}
  qFields = qFields || (query.q_fields && query.q_fields.split(','))
  if (qFields && (query.q || query._c_q || query.qs)) {
    for (const qField of qFields) {
      const prop = dataset.schema.find((p: any) => p.key === qField)
      if (!prop) throw httpError(400, `Impossible de rechercher sur le champ ${qField}, il n'existe pas dans le jeu de données.`)
      const caps = prop['x-capabilities'] || {}
      const searchable = caps.text !== false || caps.textStandard !== false || caps.index !== false || caps.wildcard === true
      if (!searchable) throw httpError(400, `Impossible de rechercher sur le champ ${qField}. Aucune fonctionnalité de recherche n'est activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
    }
  }

  // track_total_hits is expensive on large datasets
  // skip it on pages 2+ (client already has the total from page 1)
  // also support count=false or count=estimate query parameter
  if (query.after) {
    esQuery.track_total_hits = false
  } else if (query.count === 'false') {
    esQuery.track_total_hits = false
  } else if (query.count === 'estimate') {
    esQuery.track_total_hits = 1000
  } else {
    esQuery.track_total_hits = true
  }

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
  const fields = dataset.schema.map((f: any) => f.key)
  // do not include by default heavy calculated fields used for indexing geo data
  esQuery._source = (query.select && query.select !== '*')
    ? query.select.split(',')
    : fields.filter((key: string) => key !== '_geoshape' && key !== '_geocorners')
  const unknownField = esQuery._source.find((s: string) => !fields.includes(s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données.`)

  // Others are included depending on the context
  if (query.thumbnail) {
    const imageField = dataset.schema.find((f: any) => f['x-refersTo'] === 'http://schema.org/image')
    if (imageField && query.select && !esQuery._source.includes(imageField.key)) {
      esQuery._source.push(imageField.key)
    }
  }

  // Sort by list of fields (prefixed by - for descending sort)
  esQuery.sort = query.sort ? parseSort(query.sort, fields, dataset) : []
  // implicitly sort by score after other criteria
  if (!esQuery.sort.some((s: any) => !!s._score) && query.q) esQuery.sort.push('_score')
  // if there is a geo_distance filter, apply a default _geo_distance sort
  if ((query.geo_distance ?? query._c_geo_distance)) {
    if (!esQuery.sort.some((s: any) => !!s._geo_distance)) {
      const [lon, lat] = (query.geo_distance ?? query._c_geo_distance).split(/[,:]/)
      esQuery.sort.push({ _geo_distance: { _geopoint: { lon, lat }, order: 'asc', ignore_unmapped: true } })
    }
    if (!esQuery._source.includes('_geopoint')) {
      esQuery._source.push('_geopoint')
    }
  }
  // every other things equal, sort by original line order
  // this is very important as it provides a tie-breaker for search_after pagination
  if (fields.includes('_updatedAt')) {
    if (!esQuery.sort.some((s: any) => !!s._updatedAt)) esQuery.sort.push({ _updatedAt: 'desc' })
    if (!esQuery.sort.some((s: any) => !!s._i)) esQuery.sort.push({ _i: 'desc' })
  } else {
    if (!esQuery.sort.some((s: any) => !!s._i)) esQuery.sort.push('_i')
  }
  if (dataset.isVirtual) {
    // _i is not a good enough tie-breaker in the case of virtual datasets
    if (!esQuery.sort.some((s: any) => !!s._rand)) esQuery.sort.push('_rand')
  }

  // Simple highlight management
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-highlighting.html
  if (query.highlight) {
    esQuery.highlight = { fields: {}, no_match_size: 300, fragment_size: 100, pre_tags: ['<em class="highlighted">'], post_tags: ['</em>'] }
    for (const key of query.highlight.split(',')) {
      if (!fields.includes(key)) throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      const prop = dataset.schema.find((p: any) => p.key === key)
      const caps = (prop && prop['x-capabilities']) || {}
      if (caps.text === false && caps.textStandard === false) {
        throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}. La fonctionnalité de recherche plein texte n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
      }
      esQuery.highlight.fields[key + '.text'] = {}
      esQuery.highlight.fields[key + '.text_standard'] = {}
    }
  }

  const filter: any[] = []
  const must: any[] = []
  const should: any[] = []
  const mustNot: any[] = []

  // Enforced static filters from virtual datasets
  if (dataset.virtual && dataset.virtual.filters) {
    for (const f of dataset.virtual.filters) {
      if (f.values && f.values.length) {
        if (f.operator === 'nin') {
          if (f.values.length === 1) filter.push({ bool: { must_not: { term: { [f.key]: f.values[0] } } } })
          else filter.push({ bool: { must_not: { terms: { [f.key]: f.values } } } })
        } else {
          if (f.values.length === 1) filter.push({ term: { [f.key]: f.values[0] } })
          else filter.push({ terms: { [f.key]: f.values } })
        }
      }
    }
  }

  // Envorced filter in case of rest datasets with line ownership
  if (query.owner) {
    filter.push({ term: { _owner: query.owner } })
  }

  if (query.account) {
    const accountField = dataset.schema.find((f: any) => f['x-refersTo'] === 'https://github.com/data-fair/lib/account')
    if (!accountField) throw httpError(400, 'Impossible de filtrer sur le concept compte, il n\'est pas défini sur le dataset.')
    filter.push({ terms: { [accountField.key]: query.account.split(',') } })
  }

  let q = query.q ?? query._c_q
  if (q) q = q.trim()

  if (q || query.qs) {
    if (query.qs) {
      const { searchFields, esFields } = getFilterableFields(dataset, q, qFields)
      if (!ignoreInvalidQS) checkQuery(query.qs, dataset.schema, esFields)
      const qs = { query_string: { query: query.qs, fields: searchFields } }
      if (qsAsFilter) filter.push(qs)
      else must.push(qs)
    }
    if (q) {
      must.push(buildQClauses(dataset, q, qFields, query.q_mode, sqsOptions))
    }
  }
  // pre-build schema lookup maps for O(1) field resolution
  const schemaByKey = new Map()
  const schemaByConcept = new Map()
  for (const p of dataset.schema) {
    schemaByKey.set(p.key, p)
    if (p['x-concept']?.primary) schemaByConcept.set(p['x-concept'].id, p)
  }

  const ignoredKeywordFields = new Set<string>((dataset as any)._esIgnoredKeywordFields ?? [])

  for (const queryKey of Object.keys(query)) {
    const filterSuffix = filterSuffixes.find(suffix => queryKey.endsWith(suffix))
    if (!filterSuffix) continue
    let prop
    if (queryKey.startsWith('_c_')) {
      const conceptId = queryKey.slice(3, queryKey.length - filterSuffix.length)
      prop = schemaByConcept.get(conceptId)
      // concept filters can be applied to any dataset by dashboards, they should be ignored if no match is found
      if (!prop) continue
    } else {
      const propKey = queryKey.slice(0, queryKey.length - filterSuffix.length)
      prop = schemaByKey.get(propKey)
      if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${propKey}, il n'existe pas dans le jeu de données.`)
    }

    // single source of truth: every suffix except the any-of _search requires exactly one capability
    if (filterSuffix !== '_search') requiredCapability(prop, filterSuffix, FILTER_CAPABILITIES[filterSuffix] as string)

    if (filterSuffix === '_in') {
      try {
        const values = query[queryKey].startsWith('"') ? JSON.parse(`[${query[queryKey]}]`) : query[queryKey].split(',').filter(Boolean)
        if (!values.length) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
        const target = resolveExactKeywordTarget(prop, values)
        if ('impossible' in target) throw httpError(400, `Filtre ${queryKey} : une valeur dépasse ${KEYWORD_IGNORE_ABOVE} caractères et ne peut pas être filtrée exactement sur ce champ. ${columnOperationsHint(prop)}`)
        filter.push({ terms: { [target.field]: values } })
      } catch (err) {
        if ((err as any).status === 400) throw err
        throw httpError(400, `"${queryKey}" parameter is malformed`)
      }
    } else if (filterSuffix === '_nin') {
      try {
        const values = query[queryKey].startsWith('"') ? JSON.parse(`[${query[queryKey]}]`) : query[queryKey].split(',').filter(Boolean)
        if (!values.length) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
        const target = resolveExactKeywordTarget(prop, values)
        if ('impossible' in target) throw httpError(400, `Filtre ${queryKey} : une valeur dépasse ${KEYWORD_IGNORE_ABOVE} caractères et ne peut pas être filtrée exactement sur ce champ. ${columnOperationsHint(prop)}`)
        filter.push({ bool: { must_not: { terms: { [target.field]: values } } } })
      } catch (err) {
        if ((err as any).status === 400) throw err
        throw httpError(400, `"${queryKey}" parameter is malformed`)
      }
    } else if (filterSuffix === '_eq') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      const target = resolveExactKeywordTarget(prop, [query[queryKey]])
      if ('impossible' in target) throw httpError(400, `Filtre ${queryKey} : la valeur dépasse ${KEYWORD_IGNORE_ABOVE} caractères et ne peut pas être filtrée exactement sur ce champ. ${columnOperationsHint(prop)}`)
      filter.push({ term: { [target.field]: query[queryKey] } })
    } else if (filterSuffix === '_neq') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      const target = resolveExactKeywordTarget(prop, [query[queryKey]])
      if ('impossible' in target) throw httpError(400, `Filtre ${queryKey} : la valeur dépasse ${KEYWORD_IGNORE_ABOVE} caractères et ne peut pas être filtrée exactement sur ce champ. ${columnOperationsHint(prop)}`)
      filter.push({ bool: { must_not: { term: { [target.field]: query[queryKey] } } } })
    } else if (filterSuffix === '_gt') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      if (prop.format === 'date-time' && query[queryKey].length === 10 && dayjs(query[queryKey], 'YYYY-MM-DD', true).isValid()) {
        filter.push({ range: { [prop.key]: { gt: dayjs(query[queryKey]).tz(prop.timeZone || config.defaultTimeZone, true).endOf('day').toISOString() } } })
      } else {
        filter.push({ range: { [resolveRangeOrPrefixField(prop, ignoredKeywordFields.has(prop.key)).field]: { gt: query[queryKey] } } })
      }
    } else if (filterSuffix === '_gte') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      if (prop.format === 'date-time' && query[queryKey].length === 10 && dayjs(query[queryKey], 'YYYY-MM-DD', true).isValid()) {
        filter.push({ range: { [prop.key]: { gte: dayjs(query[queryKey]).tz(prop.timeZone || config.defaultTimeZone, true).startOf('day').toISOString() } } })
      } else {
        filter.push({ range: { [resolveRangeOrPrefixField(prop, ignoredKeywordFields.has(prop.key)).field]: { gte: query[queryKey] } } })
      }
    } else if (filterSuffix === '_lt') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      if (prop.format === 'date-time' && query[queryKey].length === 10 && dayjs(query[queryKey], 'YYYY-MM-DD', true).isValid()) {
        filter.push({ range: { [prop.key]: { lt: dayjs(query[queryKey]).tz(prop.timeZone || config.defaultTimeZone, true).startOf('day').toISOString() } } })
      } else {
        filter.push({ range: { [resolveRangeOrPrefixField(prop, ignoredKeywordFields.has(prop.key)).field]: { lt: query[queryKey] } } })
      }
    } else if (filterSuffix === '_lte') {
      if (!query[queryKey]) throw httpError(400, `Filtre ${queryKey} nécessite une valeur.`)
      if (prop.format === 'date-time' && query[queryKey].length === 10 && dayjs(query[queryKey], 'YYYY-MM-DD', true).isValid()) {
        filter.push({ range: { [prop.key]: { lte: dayjs(query[queryKey]).tz(prop.timeZone || config.defaultTimeZone, true).endOf('day').toISOString() } } })
      } else {
        filter.push({ range: { [resolveRangeOrPrefixField(prop, ignoredKeywordFields.has(prop.key)).field]: { lte: query[queryKey] } } })
      }
    } else if (filterSuffix === '_starts') {
      const { field } = resolveRangeOrPrefixField(prop, ignoredKeywordFields.has(prop.key))
      filter.push({ prefix: { [field]: query[queryKey] } })
    } else if (filterSuffix === '_contains') {
      filter.push({ wildcard: { [`${prop.key}.wildcard`]: `*${query[queryKey]}*` } })
    } else if (filterSuffix === '_search') {
      const subfields = []
      if (prop['x-capabilities']?.textStandard !== false) subfields.push('text_standard')
      if (prop['x-capabilities']?.text !== false) subfields.push('text')
      if (!subfields.length) requiredCapability(prop, filterSuffix, 'textStandard')
      must.push({ simple_query_string: { query: query[queryKey], fields: subfields.map(subfield => `${prop.key}.${subfield}`) } })
    } else if (filterSuffix === '_exists') {
      const fields = resolveExistsFields(prop, ignoredKeywordFields.has(prop.key))
      if (fields.length === 1) filter.push({ exists: { field: fields[0] } })
      else filter.push({ bool: { should: fields.map(f => ({ exists: { field: f } })), minimum_should_match: 1 } })
    } else if (filterSuffix === '_nexists') {
      const fields = resolveExistsFields(prop, ignoredKeywordFields.has(prop.key))
      if (fields.length === 1) mustNot.push({ exists: { field: fields[0] } })
      else mustNot.push({ bool: { should: fields.map(f => ({ exists: { field: f } })), minimum_should_match: 1 } })
    }
  }

  if (query.date_match ?? query._c_date_match) {
    const dateMatch = query.date_match ?? query._c_date_match
    const dateField = dataset.schema.find((p: any) => p['x-refersTo'] === 'http://schema.org/Date')
    const startDateField = dataset.schema.find((p: any) => p['x-refersTo'] === 'https://schema.org/startDate') ?? dateField
    const endDateField = dataset.schema.find((p: any) => p['x-refersTo'] === 'https://schema.org/endDate') ?? dateField
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
        const dateRange: any = {}
        if (startDate) dateRange.gte = startDate
        if (endDate) dateRange.lte = endDate
        filter.push({ range: { [startDateField.key]: dateRange } })
      } else {
        const outsideRange: any[] = []
        if (startDate) outsideRange.push({ range: { [endDateField.key]: { lt: startDate } } })
        if (endDate) outsideRange.push({ range: { [startDateField.key]: { gt: endDate } } })
        mustNot.push({ bool: { should: outsideRange } })
      }
    }
  }

  // bounding box filter to restrict results on geo zone: left,bottom,right,top
  const geoShapeProp = dataset.schema.find((p: any) => p.key === '_geoshape')
  const geoShape = geoShapeProp && (!geoShapeProp['x-capabilities'] || geoShapeProp['x-capabilities'].geoShape !== false)
  const geoCornersProp = dataset.schema.find((p: any) => p.key === '_geocorners')
  const geoCorners = geoCornersProp && (!geoCornersProp['x-capabilities'] || geoCornersProp['x-capabilities'].geoCorners !== false)
  if ((query.bbox || query.xyz) && !dataset.bbox) {
    throw httpError(400, '"bbox" filter cannot be used on this dataset. It is not geolocalized.')
  }
  if ((query.bbox || query._c_bbox || query.xyz) && dataset.bbox) {
    const bbox = getQueryBBOX(query, dataset)!
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
        },
        // ignore_unmapped lets a virtual dataset mix geo and non-geo children:
        // the non-geo child's index simply matches nothing instead of failing the query
        ignore_unmapped: true
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
            },
            ignore_unmapped: true
          }
        })
      } else {
        // TODO: use _geoshape after upgrading ES

        // distance of 0 is not accepted
        if (distance === '0m' || distance === '0km') distance = '1m'

        filter.push({
          geo_distance: {
            distance,
            _geopoint: { lat, lon },
            ignore_unmapped: true
          }
        })
      }
    }
  }

  const minimumShouldMatch = should.length ? 1 : 0
  esQuery.query = { bool: { filter, must, should, must_not: mustNot, minimum_should_match: minimumShouldMatch } }

  return esQuery
}

export const getQueryBBOX = (query: Record<string, any>, _dataset?: any) => {
  let bbox: number[] | undefined
  if (query.bbox ?? query._c_bbox) {
    bbox = (query.bbox ?? query._c_bbox).split(',').map(Number)
  } else if (query.xyz) {
    bbox = tiles.xyz2bbox(...query.xyz.split(',').map(Number) as [number, number, number])
  }
  if (bbox) {
    bbox[0] = geo.fixLon(bbox[0])
    bbox[2] = geo.fixLon(bbox[2])
  }
  return bbox
}

/**
 * Pre-compute schema lookups once per request instead of per result item.
 * This eliminates O(N*S) linear scans where N=items and S=schema length.
 */
export const prepareResultContext = (dataset: any, query: Record<string, any>) => {
  const schema = dataset.schema
  const schemaByKey = new Map()
  let hasIdField = false
  let imageField
  let descriptionFieldKey
  let linkField
  let emailField
  let docField
  let geometryField
  const markdownFields = []
  const separatorKeys = new Set()

  for (const f of schema) {
    schemaByKey.set(f.key, f)
    if (f.key === '_id') hasIdField = true
    if (f['x-refersTo'] === 'http://schema.org/image') imageField = f
    if (f['x-refersTo'] === 'http://schema.org/description') descriptionFieldKey = f.key
    if (f['x-refersTo'] === 'https://schema.org/WebPage') linkField = f
    if (f['x-refersTo'] === 'https://www.w3.org/2006/vcard/ns#email') emailField = f
    if (f['x-refersTo'] === 'http://schema.org/DigitalDocument') docField = f
    if (f['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') geometryField = f
    if (f['x-display'] === 'markdown') markdownFields.push(f)
    if (f.separator) separatorKeys.add(f.key)
  }

  const selectIncludesId = hasIdField && (!query.select || query.select === '*' || query.select.split(',').includes('_id'))
  const highlightKeys = query.highlight ? query.highlight.split(',') : null
  const truncate = query.truncate ? Number(query.truncate) : 0
  const skipTruncateKeys = new Set(['_thumbnail', '_highlight', '_id', '_geopoint', '_geoshape', '_attachment_url'])
  if (imageField) skipTruncateKeys.add(imageField.key)
  if (linkField) skipTruncateKeys.add(linkField.key)
  if (emailField) skipTruncateKeys.add(emailField.key)
  if (docField) skipTruncateKeys.add(docField.key)

  const geoDistanceParams = query.geo_distance ?? query._c_geo_distance
  const geoDistanceParts = geoDistanceParams ? geoDistanceParams.split(/[,:]/) : null

  return {
    schemaByKey,
    hasIdField,
    selectIncludesId,
    imageField,
    descriptionFieldKey,
    linkField,
    emailField,
    docField,
    geometryField,
    markdownFields,
    separatorKeys,
    highlightKeys,
    truncate,
    skipTruncateKeys,
    geoDistanceParts,
    schema,
    // set by the /lines pipeline when the source came from searchStream (hits still hold the raw stored
    // _attachment_url) — see rewriteAttachmentUrl below and prepareResultItem
    rewriteAttachmentUrl: undefined as boolean | undefined
  }
}

// Rewrite an `_attachment_url` from the stored absolute URL to the one the requester should see:
// oldPublicUrl → publicUrl → the request's publicBaseUrl, plus a virtual-dataset path fixup that reroutes
// a child dataset's attachment path through the virtual dataset. Shared by the buffered `search()` (which
// applies it on `hit._source` up front) and `prepareResultItem` (streamed/collected sources, applied on the
// flattened row via `ctx.rewriteAttachmentUrl`), so both modes produce identical URLs.
export const rewriteAttachmentUrl = (url: string, dataset: any, publicBaseUrl?: string): string => {
  if (config.oldPublicUrl) url = url.replace(config.oldPublicUrl, config.publicUrl)
  if (publicBaseUrl) url = url.replace(config.publicUrl, publicBaseUrl)
  if (dataset.isVirtual) {
    // use string manipulation instead of new URL() for performance
    const attachIdx = url.indexOf('/data-fair/api/v1/datasets/')
    if (attachIdx !== -1) {
      const afterPrefix = url.substring(attachIdx + '/data-fair/api/v1/datasets/'.length)
      const slashIdx = afterPrefix.indexOf('/')
      if (slashIdx !== -1) {
        const childDatasetId = afterPrefix.substring(0, slashIdx)
        url = url.replace(
          `/data-fair/api/v1/datasets/${childDatasetId}/attachments/`,
          `/data-fair/api/v1/datasets/${dataset.id}/attachments/${childDatasetId}/`
        )
      }
    }
  }
  return url
}

export const prepareResultItem = (hit: any, dataset: any, query: Record<string, any>, flatten: (source: any) => any, publicBaseUrl: string = config.publicUrl, ctx: any) => {
  const res = flatten(hit._source)
  res._score = hit._score

  if (ctx.selectIncludesId) res._id = hit._id

  // Rewrite the stored `_attachment_url` to the requester's URL (oldPublicUrl→publicUrl→publicBaseUrl +
  // virtual-dataset fixup) BEFORE any derived field consumes it — the thumbnail block below hashes
  // `_attachment_url` when `attachmentsAsImage`, so it must see the rewritten URL. This mirrors the buffered
  // `search()`, which rewrites `hit._source._attachment_url` up front. Only sources from searchStream carry
  // the raw URL (ctx.rewriteAttachmentUrl); search()'s esResponse already rewrote it (flag false → no-op).
  if (ctx.rewriteAttachmentUrl && res._attachment_url) res._attachment_url = rewriteAttachmentUrl(res._attachment_url, dataset, publicBaseUrl)

  if (ctx.highlightKeys) {
    res._highlight = {}
    for (const key of ctx.highlightKeys) {
      const textHighlight = (hit.highlight && hit.highlight[key + '.text']) || []
      const textStandardHighlight = (hit.highlight && hit.highlight[key + '.text_standard']) || []
      if (textStandardHighlight && textStandardHighlight.length && (textHighlight.length === 0 || !textHighlight[0].includes('<em class="highlighted">'))) {
        res._highlight[key] = textStandardHighlight
      } else {
        res._highlight[key] = textHighlight
      }
    }
  }

  if (query.thumbnail) {
    if (!ctx.imageField) throw httpError(400, 'Thumbnail management is only available if the "image" concept is associated to a field of the dataset.')
    if (res[ctx.imageField.key]) {
      let imageUrl = res[ctx.imageField.key]
      if (dataset.attachmentsAsImage) {
        imageUrl = imageUrl.replace(`${publicBaseUrl}/api/v1/datasets/${dataset.id}/attachments/`, '/attachments/')
        imageUrl = imageUrl.replace(`${config.publicUrl}/api/v1/datasets/${dataset.id}/attachments/`, '/attachments/')
      }
      const thumbnailId = Buffer.from(imageUrl).toString('hex')
      res._thumbnail = prepareThumbnailUrl(`${publicBaseUrl}/api/v1/datasets/${dataset.id}/thumbnail/${encodeURIComponent(thumbnailId)}`, query.thumbnail, query.draft)
    }
  }

  if (query.draft === 'true' && res._attachment_url) res._attachment_url += '?draft=true'

  if (query.html === 'true' || query.html === 'vuetify') {
    for (const field of ctx.markdownFields) {
      if (res[field.key]) {
        if (query.html === 'vuetify') res[field.key] = (vuetifyMarked.parse(res[field.key]) as string).trim()
        else res[field.key] = (defaultMarked.parse(res[field.key]) as string).trim()
        res[field.key] = sanitizeHtml(res[field.key])
      }
    }
    if (ctx.descriptionFieldKey && !ctx.markdownFields.some((f: any) => f.key === ctx.descriptionFieldKey) && res[ctx.descriptionFieldKey]) {
      if (query.html === 'vuetify') res[ctx.descriptionFieldKey] = (vuetifyMarked.parse(res[ctx.descriptionFieldKey]) as string).trim()
      else res[ctx.descriptionFieldKey] = (defaultMarked.parse(res[ctx.descriptionFieldKey]) as string).trim()
      res[ctx.descriptionFieldKey] = sanitizeHtml(res[ctx.descriptionFieldKey])
    }
  }

  if (ctx.truncate) {
    for (const key in res) {
      if (typeof res[key] !== 'string') continue
      if (ctx.skipTruncateKeys.has(key)) continue
      if (ctx.separatorKeys.has(key)) continue
      const field = ctx.schemaByKey.get(key)
      if (query.html === 'true' && field && (field['x-display'] === 'markdown' || field.key === ctx.descriptionFieldKey)) {
        res[key] = (truncateHTML as unknown as (html: string, length?: number) => string)(res[key], ctx.truncate)
      } else {
        res[key] = truncateMiddle(res[key], ctx.truncate, 0, '...')
      }
    }
  }

  if (query.wkt === 'true') {
    if (ctx.geometryField && res[ctx.geometryField.key]) {
      const geometry = typeof res[ctx.geometryField.key] === 'string' ? JSON.parse(res[ctx.geometryField.key]) : res[ctx.geometryField.key]
      res[ctx.geometryField.key] = geojsonToWKT(geometry)
    }
    if (res._geoshape) res._geoshape = geojsonToWKT(res._geoshape)
  }

  if (res._geopoint && ctx.geoDistanceParts) {
    const [lon, lat] = ctx.geoDistanceParts
    const [centerLat, centerLon] = res._geopoint.split(',')
    const distance = turfDistance([lon, lat], [centerLon, centerLat])
    res._geo_distance = distance * 1000
  }

  return res
}

export { extractError, escapeFilter } from './operations.ts'
