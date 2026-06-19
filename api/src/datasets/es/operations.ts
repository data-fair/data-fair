import { httpError } from '@data-fair/lib-utils/http-errors.js'
import memoize from 'memoizee'
import capabilities from '../../../contract/capabilities.js'

export interface ExtractedError {
  message: string
  status: number
}

/**
 * Check if a property has a given capability
 */
export const hasCapability = (prop: any, capability: string = 'index'): boolean => {
  const propCapabilities = prop['x-capabilities'] ?? {}
  if (propCapabilities[capability] === false || (['wildcard', 'textAgg'].includes(capability) && propCapabilities[capability] !== true)) {
    return false
  }
  return true
}

/**
 * Require a capability on a property, throwing an HTTP error if not present
 */
export const requiredCapability = (prop: any, filterName: string, capability: string = 'index'): void => {
  if (!hasCapability(prop, capability)) {
    throw httpError(400, `Impossible d'appliquer un filtre ${filterName} sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties[capability]?.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
  }
}

/**
 * The single source of truth: maps each filter suffix to the capability it requires.
 * Declared in canonical order (matches OpenAPI doc output). `_search` is any-of (text OR textStandard).
 */
export const FILTER_CAPABILITIES: Record<string, string | string[]> = {
  _eq: 'index',
  _neq: 'index',
  _in: 'index',
  _nin: 'index',
  _lt: 'index',
  _lte: 'index',
  _gt: 'index',
  _gte: 'index',
  _starts: 'index',
  _exists: 'index',
  _nexists: 'index',
  _contains: 'wildcard',
  _search: ['text', 'textStandard']
}

/**
 * The filter suffixes valid for a column, in canonical order.
 * NOTE: allocates — call only on error/doc paths, never on the query success path.
 */
export const getColumnFilters = (prop: any): string[] => {
  const filters: string[] = []
  for (const suffix of Object.keys(FILTER_CAPABILITIES)) {
    const cap = FILTER_CAPABILITIES[suffix]
    const ok = Array.isArray(cap) ? cap.some(c => hasCapability(prop, c)) : hasCapability(prop, cap)
    if (ok) filters.push(suffix)
  }
  return filters
}

/**
 * A fuller summary of the query operations a column supports.
 * Mirrors the enforcement in commons.js (parseSort), values-agg.js, metric-agg.js, words-agg.js.
 * NOTE: allocates — call only on error/doc paths.
 */
export const getColumnOperations = (prop: any): { filters: string[], sortable: boolean, groupable: boolean, metric: boolean, wordAgg: boolean } => {
  const caps = prop['x-capabilities'] ?? {}
  return {
    filters: getColumnFilters(prop),
    sortable: caps.values !== false || caps.insensitive !== false,
    groupable: !String(prop.key).startsWith('_geo') && caps.values !== false,
    metric: ['number', 'integer'].includes(prop.type) && caps.values !== false,
    wordAgg: hasCapability(prop, 'textAgg')
  }
}

/**
 * A French, agent- and user-friendly sentence describing what a column supports.
 * Appended to capability-rejection errors so the caller can self-correct.
 * NOTE: allocates — call only on error paths.
 */
export const columnOperationsHint = (prop: any): string => {
  const ops = getColumnOperations(prop)
  const filters = ops.filters.length ? ops.filters.join(', ') : 'aucun'
  return `Opérations disponibles sur ce champ — filtres : ${filters} ; tri : ${ops.sortable ? 'oui' : 'non'} ; groupement : ${ops.groupable ? 'oui' : 'non'}.`
}

export const tooLongError: ExtractedError = {
  message: 'Cette requête est trop longue, son traitement a été interrompu.',
  status: 504
}

/**
 * Try to produce a somewhat readable error message from a structured error from elasticsearch
 */
export const extractError = (err: any): ExtractedError => {
  // on a read path (see es/abort.js) the elasticsearch client throws RequestAbortedError when our
  // AbortSignal fires - the only thing that aborts it is the http client going away - and TimeoutError
  // when the per-request client timeout elapses
  if (err) {
    if (err.name === 'RequestAbortedError' || err.name === 'AbortError') {
      // 499 = "client closed request" (nginx convention) - the http response, if any, won't reach
      // anyone; callers must treat this as a quiet no-op (no internalError, no error metric)
      return { message: 'Requête interrompue (client déconnecté).', status: 499 }
    }
    if (err.name === 'TimeoutError') return tooLongError
  }
  const status = err.status ?? err.statusCode ?? 500
  if (typeof err === 'string') return { message: err, status }
  let errBody = (err.body && err.body.error) || (err.meta && err.meta.body && err.meta.body.error) || err.error
  if (!errBody && !!err.reason) errBody = err
  if (!errBody) {
    if (err.message) return { message: err.message, status }
    else return { message: JSON.stringify(err), status }
  }
  const parts: string[] = []
  if (errBody.reason) {
    parts.push(errBody.reason)
  }
  if (errBody.root_cause?.reason && !parts.includes(errBody.root_cause.reason)) {
    parts.push(errBody.root_cause.reason)
  }
  if (errBody.caused_by?.reason && !parts.includes(errBody.caused_by.reason)) {
    parts.push(errBody.caused_by.reason)
  }
  if (errBody.root_cause?.[0]?.reason && !parts.includes(errBody.root_cause[0].reason)) {
    parts.push(errBody.root_cause[0].reason)
  }
  if (errBody.failed_shards?.[0]?.reason) {
    const shardReason = errBody.failed_shards[0].reason
    if (shardReason.caused_by?.reason && !parts.includes(shardReason.caused_by.reason)) {
      parts.push(shardReason.caused_by.reason)
    } else {
      const reason = shardReason.reason || shardReason
      if (!parts.includes(reason)) parts.push(reason)
    }
  }
  if (parts.includes('Time exceeded')) {
    return tooLongError
  }
  return { message: parts.join(' - '), status }
}

// From a property in data-fair schema to the property in an elasticsearch mapping.
// `defaultAnalyzer` ends up as the analyzer of the `.text` inner field — only `manage-indices`
// (the ES mapping creator) cares about its actual value; shape inspectors (hasManyQSearchFields,
// getFilterableFields, the unit-test paths) only check which inner fields exist.
export const esProperty = (prop: any, defaultAnalyzer: string): any => {
  const capabilities = prop['x-capabilities'] || {}
  // Add inner text field to almost everybody so that even dates, numbers, etc can be matched textually as well as exactly
  const innerFields: any = {}
  if (capabilities.textStandard !== false) {
    // more "raw" analysis good to boost more exact matches and for wildcard queries
    innerFields.text_standard = { type: 'text', analyzer: 'standard' }
  }
  let esProp: any = {}
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
      innerFields.text = { type: 'text', analyzer: defaultAnalyzer, fielddata: textFieldData }
    }
    if (capabilities.insensitive !== false) {
      // handle case and diacritics for better sorting
      innerFields.keyword_insensitive = { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
    }
    if (capabilities.wildcard) {
      // support wildcard filters
      innerFields.wildcard = { type: 'wildcard' }
    }
    esProp = { type: 'keyword', ignore_above: 200, fields: innerFields, index, doc_values: values }
  }
  // Do not index geometry, it will be copied and simplified in _geoshape
  if (prop['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    if (prop.type === 'string') {
      esProp = { type: 'keyword', index: false, doc_values: false }
    } else {
      esProp = { enabled: false }
    }
  }
  // Hardcoded calculated properties
  if (prop.key === '_geopoint') esProp = { type: 'geo_point' }
  if (prop.key === '_geoshape') {
    if (!prop['x-capabilities'] || prop['x-capabilities'].geoShape !== false) {
      esProp = { type: 'geo_shape' }
    } else {
      esProp = { enabled: false }
    }
  }
  if (prop.key === '_geocorners') esProp = { type: 'geo_point' }
  // _attachment_url holds an absolute URL (publicUrl + datasetId + lineId + md5 + filename) that can
  // easily exceed the keyword ignore_above:200 limit (e.g. sha256 line ids or long filenames). Over the
  // limit the value is dropped from the index (kept only in _source), so _exists_ / term / agg / sort
  // silently return nothing. The wildcard type is built for long machine strings and has no such limit.
  if (prop.key === '_attachment_url') esProp = { type: 'wildcard' }
  if (prop.key === '_i') esProp = { type: 'long' }
  if (prop.key === '_rand') esProp = { type: 'integer' }
  if (prop.key === '_id') return null

  return esProp
}

// A dataset whose `q` query would otherwise expand into a huge `fields` array is given a
// `_search` catch-all field, and its `q` query targets `_search` plus the small handful of
// boost-eligible columns (label / description / DefinedTermSet) as per-field entries with
// their original `^3` / `^2` weight. We count the analyzed inner sub-fields (`.text` and
// `.text_standard` separately, since that is what actually inflates the `fields` array)
// rather than the columns. See docs/architecture/load-management.md.
export const Q_SEARCH_FIELDS_THRESHOLD = 30

// boost-eligible columns keep a per-field entry (with `^3` / `^2`) in qSearchFields in every
// regime — so they don't contribute to the catch-all's savings and don't `copy_to` it either.
const BOOST_REFERS_TO = new Set([
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://schema.org/description',
  'https://schema.org/DefinedTermSet'
])
export const isBoostEligible = (prop: any): boolean => BOOST_REFERS_TO.has(prop['x-refersTo'])

export const hasManyQSearchFields = (schema: any): boolean => {
  if (!schema) return false
  let n = 0
  for (const f of schema) {
    if (f.key === '_id') continue
    // boost-eligible columns are always referenced per-field, so they don't benefit from `_search`
    if (isBoostEligible(f)) continue
    const esProp = esProperty(f, '')
    if (!esProp || !esProp.fields) continue
    if (esProp.fields.text) n++
    if (esProp.fields.text_standard) n++
  }
  return n > Q_SEARCH_FIELDS_THRESHOLD
}

export const getFilterableFields = memoize((dataset: any, hasQ: any, qFields: any) => {
  const searchFields: string[] = []
  const wildcardFields: string[] = []
  const qSearchFields: string[] = []
  const qStandardFields: string[] = []
  const qWildcardFields: string[] = []
  const esFields: string[] = []

  // pick the `q` regime (only when no explicit q_fields was requested)
  const copyToSearch = !!hasQ && !qFields && dataset._esCopyToSearch === true
  const reduced = !!hasQ && !qFields && !copyToSearch && hasManyQSearchFields(dataset.schema)

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
    const esProp = esProperty(f, '')
    if (esProp.index !== false && esProp.enabled !== false && esProp.type === 'keyword') {
      // keyword main type: only contributes to `qSearchFields` when the column has no analyzed
      // text inner field (no `.text`, no `.text_standard`) — i.e. a pure-keyword string column
      // (text/textStandard both disabled via x-capabilities). When the analyzed inner fields
      // exist they already cover `q` matching, so the keyword main entry would be redundant.
      // It is always kept in `searchFields` for the raw `qs=` query path.
      searchFields.push(f.key)
      const hasFullText = !!(esProp.fields && (esProp.fields.text || esProp.fields.text_standard))
      if (isQField && !hasFullText) qSearchFields.push(f.key)
    }
    if (esProp.fields && (esProp.fields.text || esProp.fields.text_standard)) {
      // automatic boost of some special properties well suited for full-text search
      let suffix = ''
      if (f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label') suffix = '^3'
      if (f['x-refersTo'] === 'http://schema.org/description') suffix = '^2'
      if (f['x-refersTo'] === 'https://schema.org/DefinedTermSet') suffix = '^2'

      // in catch-all mode the catch-all `_search` field covers the analyzed text views; we still
      // list the few boost-eligible columns per-field so their `^3`/`^2` weight applies at query
      // time.
      const perField = isQField && (!copyToSearch || !!suffix)

      if (esProp.fields.text) {
        searchFields.push(f.key + '.text' + suffix)
        if (perField) qSearchFields.push(f.key + '.text' + suffix)
      }
      if (esProp.fields.text_standard) {
        searchFields.push(f.key + '.text_standard' + suffix)
        if (perField) {
          // reduced mode: deduplicate by dropping .text_standard from qSearchFields ONLY when
          // .text already covers the column (string-fulltext columns — the two analyzers are
          // a quasi-duplicate on the same source). For numeric/date columns where .text_standard
          // is the only inner field we keep it: the point is to remove the analyzer duplicate,
          // not to remove columns from the search. qStandardFields still carries it for
          // q_mode=complete's "startsWith" prefix query.
          if (!reduced || !esProp.fields.text) qSearchFields.push(f.key + '.text_standard' + suffix)
          qStandardFields.push(f.key + '.text_standard' + suffix)
        }
      }
      if (esProp.fields.wildcard) {
        wildcardFields.push(f.key + '.wildcard')
        if (isQField) qWildcardFields.push(f.key + '.wildcard')
      }
    }
  }

  if (copyToSearch) {
    qSearchFields.push('_search')
    qStandardFields.push('_search.text_standard')
  }

  return { searchFields, wildcardFields, qSearchFields, qStandardFields, qWildcardFields, esFields, copyToSearch, reduced }
}, {
  profileName: 'getFilterableFields',
  primitive: true,
  normalizer: ([dataset, hasQ, qFields]: any) => {
    return `${dataset.id}:${dataset.finalizedAt}:${!!hasQ}:${qFields ? qFields.join(',') : ''}`
  },
  max: 10000,
  maxAge: 1000 * 60 * 60, // 1 hour
})

// Builds the `q`-side `should`/`minimum_should_match` bool clause used inside `prepareQuery`.
// Pure: caller resolves `q` (already trimmed) and supplies `qMode` / `sqsOptions`.
export const buildQClauses = (
  dataset: any,
  q: string,
  qFields: string[] | undefined,
  qMode: string | undefined,
  sqsOptions: any = {}
): any => {
  const { qSearchFields, qStandardFields, qWildcardFields, reduced } = getFilterableFields(dataset, q, qFields)
  const should: any[] = []
  if (qMode === 'complete') {
    // "complete" mode, we try to accomodate for most cases and give the most intuitive results
    // to a search query where the user might be using a autocomplete type control

    // if the user didn't define wildcards himself, we use wildcard to create a "startsWith" functionality
    // this is performed on the innerfield that uses standard analysis, as language stemming doesn't work well in this case
    // we also perform a contains filter if some wildcard functionnality is activate
    if (!q.includes('*') && !q.includes('?')) {
      if (qStandardFields.length) {
        should.push({ simple_query_string: { query: `${q}*`, fields: qStandardFields, ...sqsOptions } })
      }
      if (qWildcardFields.length) {
        should.push({ query_string: { query: `*${q}*`, fields: qWildcardFields, ...sqsOptions } })
      }
    }
    // if the user submitted a multi word query and didn't use quotes
    // we add some quotes to boost results with sequence of words
    if (qSearchFields.length && q.includes(' ') && !q.includes('"')) {
      should.push({ simple_query_string: { query: `"${q}"`, fields: qSearchFields, ...sqsOptions } })
    }
    if (qSearchFields.length) {
      should.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
    }
  } else {
    // default "simple" mode uses ES simple query string directly
    // only tuning is that we match both on stemmed and raw inner fields to boost exact matches
    if (qSearchFields.length) {
      should.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
    }
    // in "reduced" mode we already dropped .text_standard from qSearchFields and skip this clause
    // (qStandardFields is still populated but only meant for the complete-mode prefix query)
    if (qStandardFields.length && !reduced) {
      should.push({ simple_query_string: { query: q, fields: qStandardFields, ...sqsOptions } })
    }
  }
  return { bool: { should, minimum_should_match: 1 } }
}

// Pure mapping builder used by manage-indices.indexDefinition. Given the already-extended
// schema and the analyzer string, returns the `properties` shape — including the catch-all
// `_search` field and `copy_to` annotations on non-boost-eligible text columns.
export const buildIndexMappings = (
  dataset: any,
  jsProps: any[],
  defaultAnalyzer: string
): { properties: Record<string, any>, wide: boolean } => {
  const properties: Record<string, any> = {}
  const wide = hasManyQSearchFields(jsProps)
  if (wide) {
    properties._search = {
      type: 'text',
      analyzer: defaultAnalyzer,
      fields: { text_standard: { type: 'text', analyzer: 'standard' } }
    }
  }
  for (const jsProp of jsProps) {
    const esProp = esProperty(jsProp, defaultAnalyzer)
    if (esProp) {
      if (wide && esProp.fields && (esProp.fields.text || esProp.fields.text_standard) && !isBoostEligible(jsProp)) {
        // boost-eligible columns are queried per-field with their ^3/^2 boost — no need to copy them into _search
        esProp.copy_to = '_search'
      }
      if (jsProp['x-extension'] && dataset.extensions && dataset.extensions.find((e: any) => e.type === 'remoteService' && jsProp['x-extension'] === e.remoteService + '/' + e.action && jsProp.key.startsWith(e.propertyPrefix + '.'))) {
        const extKey = jsProp.key.split('.')[0]
        properties[extKey] = properties[extKey] || { dynamic: 'strict', properties: {} }
        properties[extKey].properties[jsProp.key.replace(extKey + '.', '')] = esProp
      } else {
        properties[jsProp.key] = esProp
      }
    }
    if (jsProp.key === '_geoshape' && jsProp['x-capabilities']?.vtPrepare) {
      properties._vt_prepared = {
        properties: {
          xyz: { type: 'keyword', index: true, doc_values: false },
          pbf: { type: 'binary', store: false, doc_values: false }
        }
      }
    }
  }
  return { properties, wide }
}

/**
 * Escape special Lucene query characters in a filter value
 * cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
 */
export const escapeFilter = (val: any): any => {
  if (typeof val !== 'string') return val
  return [].map.call(val, (char: string) => {
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

/**
 * Builds the aggregations object for the words aggregation.
 * significant_text is costly, and we look for approximative statistics in words-agg
 * not for exhaustivity, so we run it on a sample.
 */
export const buildWordsAggs = (aggType: 'terms' | 'significant_text', field: string, size: number) => {
  const aggs: Record<string, any> = {
    sample: {
      sampler: {
        shard_size: 1000
      },
      aggregations: {
        words: {
          [aggType]: { field, size }
        }
      }
    }
  }

  if (aggType === 'significant_text') {
    aggs.sample.aggregations.words.significant_text.filter_duplicate_text = true
  }

  return aggs
}
