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

// single-analyzed-field resolution — spec §2. The deprecated pair degrades to `searchable`,
// an explicit text:false vetoes the language meta, and exactly one analyzed subfield exists.
// Every field name returned here also exists in legacy (dual-field) indexes — that superset
// property is what lets routing ignore index age entirely.
// CAUTION for the routing migration: `searchable: false` means "no analyzed field", NOT "out of
// `q`". getFilterableFields still routes such string columns to their keyword view
// (`.keyword_insensitive`, else the keyword main type), and routes `.wildcard` independently of
// analysis. Dropping either when wiring this function into the fanout is a silent recall
// regression — guarded by q-fields.unit, q-keyword-insensitive.api and q-wildcard-column.api.
// `prefixField` is the target for q_mode=complete's prefix clause — task 8: a `.text` field with
// language analysis STEMS, so the indexed token can end up shorter than what the user has typed
// so far, and a prefix match against it silently stops matching mid-word. `.text_standard` never
// stems, so it already serves prefix directly and `prefixField` just equals `field` there. Only
// `.text` columns get a dedicated (lean, unstemmed) `.prefix` companion — see esProperty.
// EXCEPTION to the "every field name also exists in legacy indexes" invariant above: `.prefix` is
// new in task 8, so a dataset whose schema was already stamped with a `language` (Mongo-only, no
// reindex) does NOT have it in its ES mapping until the next reindex. Targeting `prefixField`
// alone there would silently match zero rows (an unmapped field in a multi-field query matches
// nothing — no error), which is worse than the stemming bug this task fixes. getFilterableFields
// therefore unions `field` alongside `prefixField` in qStandardFields for these columns: a
// not-yet-reindexed index still matches (degraded to master's stemmed-prefix behavior via
// `field`), a reindexed one also gets correct unstemmed prefix matching via `prefixField`. DO NOT
// "simplify" this back to `prefixField` alone.
export const resolveSearchField = (prop: any): { searchable: boolean, language?: string, field?: string, prefixField?: string } => {
  const capabilities = prop['x-capabilities'] || {}
  const textOn = capabilities.text !== false
  const standardOn = capabilities.textStandard !== false
  if (!textOn && !standardOn) return { searchable: false }
  // only plain string columns carry language analysis (scalars/dates only ever had .text_standard)
  const isPlainString = prop.type === 'string' && (!prop.format || prop.format === 'uri-reference')
  if (isPlainString && textOn && prop.language) {
    return { searchable: true, language: prop.language, field: prop.key + '.text', prefixField: prop.key + '.prefix' }
  }
  // legacy "french-only" column (textStandard:false) not yet stamped: its index carries `.text`
  // and NOT `.text_standard`, so it must target `.text` — analyzed with the platform default by
  // the config-bound wrapper. Stamping (§3) promotes this into the branch above.
  if (isPlainString && textOn && !standardOn) return { searchable: true, field: prop.key + '.text', prefixField: prop.key + '.prefix' }
  if (standardOn) return { searchable: true, field: prop.key + '.text_standard', prefixField: prop.key + '.text_standard' }
  return { searchable: false }
}

// The keyword `ignore_above` character limit. Values longer than this are dropped from the keyword
// index and its doc_values (kept only in _source), so term/exists/range/sort/agg on the main keyword
// field silently miss them. See docs/architecture/load-management.md.
export const KEYWORD_IGNORE_ABOVE = 200

// A property mapped as `{type:keyword, ignore_above:200}` by esProperty — a plain or uri-reference
// string. Only these are exposed to the ignore_above truncation problem.
// Fields with `x-capabilities.nativeWildcard: true` are mapped as ES `wildcard` type and have no
// ignore_above limit, so they are excluded.
// Geometry-refersTo string fields are mapped as `{type:keyword, index:false}` (no ignore_above), so
// they are also excluded — a term filter with a long operand on such a field should silently match
// nothing rather than 400.
const GEOMETRY_REFERS_TO = 'https://purl.org/geojson/vocab#geometry'
export const isLengthLimitedKeyword = (prop: any): boolean =>
  prop?.type === 'string' && (prop.format === 'uri-reference' || !prop.format) &&
  prop?.['x-capabilities']?.nativeWildcard !== true &&
  prop?.['x-refersTo'] !== GEOMETRY_REFERS_TO

// Exact (term/terms) filter target — OPERAND-DRIVEN, independent of whether the column currently
// holds long values: a value longer than the limit can never be a keyword term, so
//  - short values (≤ limit) keep the fast keyword main field
//  - long values (> limit) route to `.wildcard` when configured, else are impossible (caller 400s).
export const resolveExactKeywordTarget = (prop: any, values: string[]): { field: string } | { impossible: true } => {
  if (!isLengthLimitedKeyword(prop)) return { field: prop.key }
  const anyTooLong = values.some(v => typeof v === 'string' && v.length > KEYWORD_IGNORE_ABOVE)
  if (!anyTooLong) return { field: prop.key }
  if (hasCapability(prop, 'wildcard')) return { field: prop.key + '.wildcard' }
  return { impossible: true }
}

// Existence-check fields. `flagged` = the column actually dropped values (persisted detection). When
// not flagged we keep the fast, correct keyword path. When flagged we make existence length-safe with
// no reindex: `.wildcard` alone if configured, else union keyword (≤ limit docs) with an analyzed
// sub-field (> limit docs always produce ≥1 token). A flagged pure-keyword column has no safe fallback.
export const resolveExistsFields = (prop: any, flagged: boolean): string[] => {
  if (!isLengthLimitedKeyword(prop) || !flagged) return [prop.key]
  if (hasCapability(prop, 'wildcard')) return [prop.key + '.wildcard']
  const fields = [prop.key]
  // exactly one analyzed subfield exists per column (spec §2) — target it rather than guessing from
  // the deprecated capability pair, which no longer describes the mapping.
  const search = resolveSearchField(prop)
  if (search.field) fields.push(search.field)
  return fields
}

// Prefix (_starts) / range filter field. Un-flagged or non-keyword → fast keyword path, certain.
// Flagged with `.wildcard` → route there (length-safe). Flagged without wildcard → keep keyword but
// mark `uncertain` (a short prefix can still match a dropped long value; not validatable by operand).
export const resolveRangeOrPrefixField = (prop: any, flagged: boolean): { field: string, uncertain: boolean } => {
  if (!isLengthLimitedKeyword(prop) || !flagged) return { field: prop.key, uncertain: false }
  if (hasCapability(prop, 'wildcard')) return { field: prop.key + '.wildcard', uncertain: false }
  return { field: prop.key, uncertain: true }
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
  // single-analyzed-field resolution (spec §2, resolveSearchField) decides WHICH field exists —
  // scalars/dates only ever materialize `.text_standard`; plain strings are resolved below.
  const search = resolveSearchField(prop)
  const innerFields: any = {}
  const isPlainString = prop.type === 'string' && (!prop.format || prop.format === 'uri-reference')
  if (search.field && !isPlainString) {
    // scalars, dates: standard-analyzed textual matching (unchanged behavior)
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
    if (search.field?.endsWith('.text')) {
      // language based analysis for better recall with stemming, etc — or the platform default
      // analyzer for a legacy french-only column not yet stamped with a `language` (see
      // resolveSearchField)
      innerFields.text = { type: 'text', analyzer: defaultAnalyzer, fielddata: textFieldData }
      // unstemmed companion for q_mode=complete's prefix clause: a stemmed field cannot serve
      // prefix matching (the indexed token is shorter than what the user typed). Lean on purpose —
      // the prefix query is a constant-score Lucene PrefixQuery, so positions and norms would be
      // dead weight (see resolveSearchField and docs/architecture/text-search-evaluation.md).
      innerFields.prefix = { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false }
    } else if (search.field?.endsWith('.text_standard')) {
      // more "raw" analysis good to boost more exact matches and for wildcard queries
      innerFields.text_standard = { type: 'text', analyzer: 'standard', fielddata: textFieldData }
    }
    if (capabilities.insensitive !== false) {
      // handle case and diacritics for better sorting
      innerFields.keyword_insensitive = { type: 'keyword', ignore_above: KEYWORD_IGNORE_ABOVE, normalizer: 'insensitive_normalizer' }
    }
    if (capabilities.wildcard) {
      // support wildcard filters
      innerFields.wildcard = { type: 'wildcard' }
    }
    esProp = { type: 'keyword', ignore_above: KEYWORD_IGNORE_ABOVE, fields: innerFields, index, doc_values: values }
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

// ---- metric aggregations (metric_agg, simple_metrics_agg, values_agg/geo_agg metric params) ----

export const acceptedMetricAggsByType: Record<string, string[]> = {
  number: ['avg', 'sum', 'min', 'max', 'stats', 'value_count', 'percentiles', 'cardinality'],
  string: ['min', 'max', 'cardinality', 'value_count'],
  other: ['value_count']
}
export const acceptedMetricAggs: string[] = []
for (const metrics of Object.values(acceptedMetricAggsByType)) {
  for (const metric of metrics) {
    if (!acceptedMetricAggs.includes(metric)) acceptedMetricAggs.push(metric)
  }
}
export const defaultMetricAggsByType: Record<string, string[]> = {
  number: ['min', 'max'],
  string: ['cardinality'],
  other: []
}

export const getMetricType = (field: any): 'number' | 'string' | 'other' => {
  if (field.type === 'integer' || field.type === 'number') {
    return 'number'
  } else if (field.type === 'string' && (field.format === 'date' || field.format === 'date-time')) {
    return 'number'
  } else if (field.type === 'string') {
    return 'string'
  } else {
    return 'other'
  }
}

// ES types that can serve the doc-values based metric aggregations. Geo types, object/nested
// and disabled mappings cannot.
const METRIC_AGGREGATABLE_ES_TYPES = new Set(['long', 'integer', 'double', 'boolean', 'date', 'keyword', 'wildcard'])

// Whether metric aggregations can run at all on the column. Derived from the actual ES mapping
// (esProperty) so it cannot drift from it: geometry-concept columns are mapped
// {type: keyword, doc_values: false}, `values: false` columns lose their doc_values, the geo
// calculated columns are geo_point / geo_shape, etc. Aggregating on any of those makes ES fail
// the whole request ("all shards failed" / fielddata errors).
export const isMetricAggregatable = (prop: any): boolean => {
  const esProp = esProperty(prop, '')
  if (!esProp?.type || !METRIC_AGGREGATABLE_ES_TYPES.has(esProp.type)) return false
  return esProp.doc_values !== false
}

export const assertMetricAccepted = (field: any, metric: string): void => {
  const acceptedAggs = acceptedMetricAggsByType[getMetricType(field)]
  if (!acceptedAggs?.includes(metric)) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${field.key}. La métrique "${metric}", n'est pas supportée pour ce type de champ.`)
  }
  if (!isMetricAggregatable(field)) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${field.key}. Ce champ ne supporte pas les agrégations de métriques.`)
  }
}

// The effective columns list of /simple_metrics_agg — shared by the aggregations builder
// (metric-agg.ts) and the per-request hint (query-advice.ts) so they always agree.
// Explicit `fields` values are strictly validated (400 before any ES call); the default list
// keeps only the columns that can actually serve the requested (or default) metrics, so it
// never produces an ES-level failure.
export const getSimpleMetricsFields = (dataset: any, query: Record<string, any>): string[] => {
  const globalMetrics: string[] | undefined = query.metrics ? String(query.metrics).split(',') : undefined
  if (globalMetrics) {
    for (const metric of globalMetrics) {
      if (!acceptedMetricAggs.includes(metric)) throw httpError(400, `La métrique "${metric}" n'existe pas.`)
    }
  }
  if (query.fields) {
    const fields: string[] = String(query.fields).split(',')
    for (const key of fields) {
      const field = dataset.schema.find((f: any) => f.key === key)
      if (!field) throw httpError(400, `Impossible de calculer des métriques sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      if (!hasCapability(field, 'values')) {
        throw httpError(400, `Impossible de calculer une métrique sur le champ ${key}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
      }
      if (!isMetricAggregatable(field)) {
        throw httpError(400, `Impossible de calculer des métriques sur le champ ${key}. Ce champ ne supporte pas les agrégations de métriques.`)
      }
      if (globalMetrics) {
        for (const metric of globalMetrics) assertMetricAccepted(field, metric)
      }
    }
    return fields
  }
  return dataset.schema
    .filter((f: any) => !f['x-calculated'] && hasCapability(f, 'values') && isMetricAggregatable(f))
    .filter((f: any) => !globalMetrics || globalMetrics.every(m => acceptedMetricAggsByType[getMetricType(f)].includes(m)))
    .map((f: any) => f.key)
}

// A dataset whose `q` query would otherwise expand into a huge `fields` array is given a
// `_search` catch-all field, and its `q` query targets `_search` plus the small handful of
// boost-eligible columns (label / description / DefinedTermSet) as per-field entries with
// their original `^3` / `^2` weight. We count the analyzed inner sub-fields (`.text` and
// `.text_standard` separately, since that is what actually inflates the `fields` array)
// rather than the columns. See docs/architecture/load-management.md.
// Halved from 30: single-analyzed-field emission (esProperty, spec §2) means a DEFAULT string
// column (both text capabilities on) now contributes ONE analyzed inner field instead of two, so
// halving the threshold preserves the pre-change wide/narrow decision boundary for those columns
// only (16 default string columns was 32 > 30 before, and is 16 > 15 now — same verdict).
// Deliberate side effect: every column that ALREADY contributed a single field — numbers/dates
// (only ever `.text_standard`) and string columns with one of the two text capabilities disabled —
// now crosses the threshold at half as many columns. Accepted: a wide dataset of such columns
// getting the catch-all is cheap.
export const Q_SEARCH_FIELDS_THRESHOLD = 15

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
  // `reduced` no longer changes anything built below — with a single analyzed field per column there
  // is no analyzer duplicate left to drop (spec §4). It is still computed and returned unchanged so
  // consumers of the returned shape (buildQClauses' clause-B / q_mode=and match set) keep working.
  const reduced = !!hasQ && !qFields && !copyToSearch && hasManyQSearchFields(dataset.schema)

  for (const f of dataset.schema) {
    const capabilities = f['x-capabilities'] || []
    if (capabilities.index !== false) esFields.push(f.key)
    // only the ONE analyzed subfield the column actually materializes is allowed in explicit `qs=`
    // references (spec §2/§4). Old dual-field indexes still carry the other name, but validating
    // against the target model keeps behavior uniform across index generations — a reference to the
    // non-materialized name gets the 400-with-hint built in commons.checkQuery.
    const search = resolveSearchField(f)
    if (search.field) esFields.push(search.field)
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
      if (isQField && !hasFullText) {
        // prefer the `.keyword_insensitive` view when it exists: matching is still on the whole
        // value (no analysis was requested on this column) but the normalizer (lowercase +
        // asciifolding) applies to the query terms too, so `q` ignores case and diacritics
        // instead of requiring the byte-exact value. Read from the mapping rather than from
        // x-capabilities so it cannot drift from esProperty.
        qSearchFields.push(esProp.fields?.keyword_insensitive ? f.key + '.keyword_insensitive' : f.key)
      }
    }
    // `.wildcard` is mapped from the wildcard capability alone (esProperty), independently of text
    // analysis — a code column typically disables text/textStandard and enables wildcard precisely
    // because character-group matching is the only thing that makes sense on it. So the wildcard
    // fanout is evaluated at column level, not inside the analyzed-fields branch.
    if (esProp.fields?.wildcard) {
      wildcardFields.push(f.key + '.wildcard')
      if (isQField) qWildcardFields.push(f.key + '.wildcard')
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

      // Exactly ONE analyzed subfield exists per column (spec §2): `.text` when the column has an
      // effective `language`, `.text_standard` otherwise. The old "reduced" dedup — drop
      // `.text_standard` from qSearchFields when `.text` already covered the same column — has
      // nothing left to deduplicate and dissolves (spec §4). The name is read off the mapping, not
      // off x-capabilities, so it can never drift from esProperty.
      const analyzed = esProp.fields.text ? '.text' : '.text_standard'
      searchFields.push(f.key + analyzed + suffix)
      if (perField) {
        qSearchFields.push(f.key + analyzed + suffix)
        // qStandardFields drives q_mode=complete's "startsWith" prefix clause. For a language
        // column it is the UNION of the effective analyzed field (`.text` — degrades gracefully
        // to master's stemmed-prefix behavior on a dataset stamped with a language but not yet
        // reindexed, see the CAUTION above resolveSearchField) and its unstemmed `.prefix`
        // companion (task 8 — correct, unstemmed prefix matching once reindexed). For every other
        // column `prefixField` already equals the analyzed field, so this collapses to the single
        // entry it always was.
        const standardField = f.key + analyzed + suffix
        if (search.prefixField && search.prefixField !== search.field) {
          qStandardFields.push(standardField, search.prefixField + suffix)
        } else {
          qStandardFields.push(standardField)
        }
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
  sqsOptions: any = {},
  requiredWords?: string[]
): any => {
  const { qSearchFields, qStandardFields, qWildcardFields, reduced } = getFilterableFields(dataset, q, qFields)
  // `.prefix` companions (task 8) are lean, position-less fields (index_options: 'docs') dedicated
  // to the startsWith clause below — a phrase (quoted `q`) or proximity query against them throws
  // ES's "field was indexed without position data; cannot run PhraseQuery". That includes the
  // startsWith clause itself when `q` carries a quote (`"a b"`, `"a b"~2` — not an autocomplete-
  // prefix case anyway): it must fall back to position-bearing fields only. Every OTHER use of
  // qStandardFields (clause B below, the `and`/`requiredWords` match set) must exclude `.prefix`
  // unconditionally; for every non-language column `prefixField` already equals the analyzed
  // field, so this filter is a no-op there.
  const positionSafeFields = (fields: string[]): string[] => fields.filter(f => !/\.prefix(\^\d+)?$/.test(f))
  const should: any[] = []
  if (qMode === 'complete') {
    // "complete" mode, we try to accomodate for most cases and give the most intuitive results
    // to a search query where the user might be using a autocomplete type control

    // if the user didn't define wildcards himself, we use wildcard to create a "startsWith" functionality
    // this is performed on the innerfield that uses standard analysis, as language stemming doesn't work well in this case
    // we also perform a contains filter if some wildcard functionnality is activate
    if (!q.includes('*') && !q.includes('?')) {
      // a quoted `q` (`"a b"`, or the proximity form `"a b"~2`) compiles this into a Lucene
      // PhraseQuery once `*` is appended, which needs position data `.prefix` doesn't carry — drop
      // it and fall back to the position-bearing fields (degrades to master's stemmed-prefix
      // behavior for a language column, same as clause B below).
      const startsWithFields = q.includes('"') ? positionSafeFields(qStandardFields) : qStandardFields
      if (startsWithFields.length) {
        should.push({ simple_query_string: { query: `${q}*`, fields: startsWithFields, ...sqsOptions } })
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
    // Historically this clause boosted exact matches by ALSO querying the raw `.text_standard`
    // view of columns whose `.text` was already in clause A. With one analyzed field per column
    // (spec §2) that second view is gone: `positionSafeFields(qStandardFields)` is now a SUBSET of
    // `qSearchFields` for every per-column regime, so emitting it would run the exact same scored
    // query twice on the hottest read path. Emit it only when it still carries a field clause A
    // does not have — in practice the catch-all regime, where `_search.text_standard` is a genuine
    // second analyzed view of the same `_search` catch-all (its alignment is deferred, spec §4).
    const standardFields = positionSafeFields(qStandardFields)
    if (standardFields.length && !reduced && standardFields.some(f => !qSearchFields.includes(f))) {
      should.push({ simple_query_string: { query: q, fields: standardFields, ...sqsOptions } })
    }
  }
  const scored = { bool: { should, minimum_should_match: 1 } }

  // "score broad, match strict": q_mode=and and q_required tighten the MATCH SET through a
  // non-scoring filter while scores stay pure OR — the page is OR's page restricted to the
  // tightened set, and the selective filter leads the iteration. Requirements must NEVER move
  // into scoring position (measured 2.5× slower on ES 7, see load-management.md §9).
  // Not composed with `complete` mode (its prefix/wildcard clauses carry their own semantics).
  if (qMode !== 'complete') {
    const matchFields = reduced ? qSearchFields : [...qSearchFields, ...positionSafeFields(qStandardFields)]
    if (qMode === 'and' && matchFields.length) {
      return { bool: { must: [scored], filter: [{ simple_query_string: { query: q, fields: matchFields, default_operator: 'and' } }] } }
    }
    if (requiredWords?.length && matchFields.length) {
      return { bool: { must: [scored], filter: requiredWords.map(word => ({ multi_match: { query: word, fields: matchFields } })) } }
    }
  }
  return scored
}

// Pure mapping builder used by manage-indices.indexDefinition. Given the already-extended
// schema and the analyzer string, returns the `properties` shape — including the catch-all
// `_search` field and `copy_to` annotations on non-boost-eligible text columns.
// `languageAnalyzers` resolves each column's own analyzer from its stamped `language` (falling
// back to `defaultAnalyzer`) — the catch-all `_search` field itself keeps the platform default
// (alignment deferred, see spec §4).
export const buildIndexMappings = (
  dataset: any,
  jsProps: any[],
  defaultAnalyzer: string,
  languageAnalyzers: Record<string, string> = {}
): { properties: Record<string, any>, wide: boolean } => {
  const properties: Record<string, any> = {}
  // CSV-equivalent byte size of the line, summed by storage() for the indexed_bytes
  // metric. Aggregated only (doc_values), never searched.
  properties._bytes = { type: 'integer', index: false }
  const wide = hasManyQSearchFields(jsProps)
  if (wide) {
    properties._search = {
      type: 'text',
      analyzer: defaultAnalyzer,
      fields: { text_standard: { type: 'text', analyzer: 'standard' } }
    }
  }
  for (const jsProp of jsProps) {
    const esProp = esProperty(jsProp, languageAnalyzers[jsProp.language] ?? defaultAnalyzer)
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

// CSV-equivalent size accounting for the indexed_bytes metric.
// Counted columns are exactly the ones the CSV export emits (outputs.ts): schema
// properties without x-calculated. Extension columns are nested objects in the
// indexed item, so counting walks the top-level key segment of each property.
export const lineBytesSpec = (schema: any[]): { prefixes: Set<string>, nbCols: number } => {
  const counted = (schema ?? []).filter(p => !p['x-calculated'])
  return {
    prefixes: new Set(counted.map(p => p.key.split('.')[0])),
    nbCols: counted.length
  }
}

const valueBytes = (value: any): number => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (typeof value === 'object') {
    let sum = 0
    for (const v of Object.values(value)) sum += valueBytes(v)
    return sum
  }
  return Buffer.byteLength(String(value))
}

// per line: value bytes + 1 byte per counted column (separator / newline),
// mirroring the size of a CSV export of the same data
export const lineBytes = (item: Record<string, any>, spec: { prefixes: Set<string>, nbCols: number }): number => {
  let sum = spec.nbCols
  for (const prefix of spec.prefixes) sum += valueBytes(item[prefix])
  return sum
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
 * ES field to aggregate on for a schema property in a unique constraint.
 * String columns use the base keyword field, or the length-safe `.wildcard`
 * sub-field when the wildcard capability is enabled (avoids ignore_above:200
 * silently dropping long values from the aggregation).
 */
export const unicityAggField = (prop: any): string => {
  if (isLengthLimitedKeyword(prop) && hasCapability(prop, 'wildcard')) return `${prop.key}.wildcard`
  return prop.key
}

/**
 * Human-readable label for one part of a unicity duplicate-group composite key (used to build
 * `DuplicateGroup.keyLabel`, itself written as `raw_value` in the validation diagnostic CSV).
 * ES composite `terms` sources on `date`/`date-time` columns return the raw epoch-millis bucket
 * key, which is meaningless to a user reading the CSV — convert it to the date the user would
 * recognize: `YYYY-MM-DD` for `format: 'date'` (mirrors the slicing convention already used for
 * date buckets in `es/values.ts`), full ISO 8601 for `format: 'date-time'`. Every other column
 * type (string, number, boolean, …) is passed through as its string form, unchanged.
 * Defensive: composite `terms` sources never enable `missing_bucket`, and ES always emits a
 * finite numeric key for a `date`-mapped field, so a null/undefined/non-finite/non-numeric key
 * should never reach here — but a stray one must never crash the indexer, so it degrades to ''
 * / the raw string instead of throwing (a bad `Date` would otherwise throw a RangeError on
 * NaN/±Infinity, or silently produce "Invalid Date").
 */
export const unicityKeyPartLabel = (prop: any, value: any): string => {
  if (value === null || value === undefined) return ''
  const isDateColumn = prop?.type === 'string' && (prop.format === 'date' || prop.format === 'date-time')
  if (isDateColumn && Number.isFinite(value)) {
    const iso = new Date(value).toISOString()
    return prop.format === 'date' ? iso.slice(0, 10) : iso
  }
  return String(value)
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

// ---- Scoped filters for virtual datasets ----

// element of dataset.virtual.filters (see contract in api/types/dataset/schema.js)
export type VirtualFilter = { key: string, operator?: 'in' | 'nin', values?: string[] }

// One arrival of a non-virtual descendant of a virtual dataset, as resolved by the traversal in
// utils/virtual.ts and attached to the queryable dataset as `dataset.descendants` — the single
// source of truth for both the multi-index target (aliasName) and the scoped filters below.
// `index` is resolved by the producer so this module stays config-free.
// `filters` holds the merged filters of the virtual ancestors on this path; absent = unfiltered.
// The array is ARRIVAL-based: a descendant reachable both through a filtered and an unfiltered path
// appears twice, once with filters and once without, which gives union-of-paths semantics below.
export interface QueryableDescendant {
  id: string
  index: string
  filters?: VirtualFilter[]
}

// translate dataset.virtual.filters into ES filter clauses
export const virtualFilterClauses = (filters: VirtualFilter[]): any[] => {
  const clauses: any[] = []
  for (const f of filters) {
    if (!f.values || !f.values.length) continue
    if (f.operator === 'nin') {
      if (f.values.length === 1) clauses.push({ bool: { must_not: { term: { [f.key]: f.values[0] } } } })
      else clauses.push({ bool: { must_not: { terms: { [f.key]: f.values } } } })
    } else {
      if (f.values.length === 1) clauses.push({ term: { [f.key]: f.values[0] } })
      else clauses.push({ terms: { [f.key]: f.values } })
    }
  }
  return clauses
}

// a single filter clause restricting each filtered descendant's subtree to the rows matching
// the merged filters of its virtual ancestors. term/terms on the _index metafield match index
// aliases, so the same names used by aliasName work here.
// returns null when no descendant carries filters: an unfiltered virtual dataset must add no
// clause at all, keeping its query shape identical to a non-virtual one.
export const descendantsFilterClause = (descendants: QueryableDescendant[] | undefined): any | null => {
  // cheap fail-loud check: this is a programming error (a caller that resolved descendants in a
  // stale shape, or not at all), never user input, so it is an internal 500-class error. Types
  // alone cannot be trusted here, the repo's tsc is not clean.
  if (!Array.isArray(descendants)) throw new Error('[internal] missing descendants on a virtual dataset, refusing to query it unscoped')
  // validate every element up front, before the early return below, so a malformed descendant is
  // always caught rather than only when some sibling happens to carry filters
  for (const descendant of descendants) {
    if (!descendant.index) throw new Error(`[internal] descendant ${descendant.id} has no resolved index, refusing to query it unscoped`)
  }
  if (!descendants.some(d => d.filters?.length)) return null
  const should: any[] = []
  const unfilteredIndices = new Set<string>()
  for (const descendant of descendants) {
    if (!descendant.filters?.length) unfilteredIndices.add(descendant.index)
  }
  if (unfilteredIndices.size) should.push({ terms: { _index: [...unfilteredIndices] } })
  for (const descendant of descendants) {
    if (!descendant.filters?.length) continue
    should.push({ bool: { filter: [{ term: { _index: descendant.index } }, ...virtualFilterClauses(descendant.filters)] } })
  }
  return { bool: { minimum_should_match: 1, should } }
}

// ---- Approximate counts for ranked text searches (see load-management.md §9) ----

export interface ApproxCountConfig {
  minDatasetSize: number | null
  cap: number
  sampleTarget: number
}

export interface ApproxCountMode {
  cap: number
  /** exclusive upper bound of the `_rand` sample slice (`_rand` is uniform in [0, 1_000_000)) */
  randBound: number
  /** exact sampling probability = randBound / 1_000_000 */
  probability: number
}

const RAND_RANGE = 1_000_000

// Worst-case estimate accuracy happens on queries matching barely more than the cap: keep at
// least this many expected samples there (error ∝ 1/√samples → worst case ~±10 %), whatever
// the configured cap. Derived, not configured — it must track the cap to keep the guarantee.
const MIN_BOUNDARY_SAMPLES = 100

// Sampling more than half the dataset would cost about as much as counting it exactly.
// Only reachable with unusual configurations (a tiny cap raises the accuracy floor) —
// never with the defaults.
const MAX_PROBABILITY = 0.5

/**
 * The `_rand` sampling parameters for a dataset size — shared by the ranked-search default
 * and count=estimate. The probability balances one cost concern against one accuracy
 * concern, under a safety ceiling.
 */
export const getSamplingParams = (datasetCount: number, cfg: ApproxCountConfig): { randBound: number, probability: number } => {
  const costBudget = cfg.sampleTarget / datasetCount // scan ~sampleTarget docs whatever the dataset size
  const accuracyFloor = MIN_BOUNDARY_SAMPLES / cfg.cap // enough samples for a query right at the cap boundary
  const probability = Math.min(MAX_PROBABILITY, Math.max(costBudget, accuracyFloor))
  // `_rand < randBound` can only express an integer bound: quantize, then return the EXACT
  // probability that bound implements — extrapolating with the pre-rounding value would put
  // a systematic bias on every estimate
  const randBound = Math.round(probability * RAND_RANGE)
  return { randBound, probability: randBound / RAND_RANGE }
}

/**
 * Is this request's total estimated? The count model in one sentence: totals are exact by
 * default, EXCEPT ranked text searches on large datasets where they are estimated —
 * count=estimate opts any query into the same estimation, count=exact opts out. Returns
 * the sampling mode when the total is estimated (and the feature is enabled), null when it
 * stays exact (or is not computed at all).
 */
export const getCountMode = (
  dataset: { count?: number },
  query: Record<string, any>,
  cfg: ApproxCountConfig
): ApproxCountMode | null => {
  if (cfg.minDatasetSize == null) return null // kill switch: no sampling anywhere
  if (typeof dataset.count !== 'number' || dataset.count <= 0) return null
  if (query.count === 'false' || query.after) return null // no total is computed at all
  // explicit opt-in: any query shape, any dataset size
  if (query.count === 'estimate') return { cap: cfg.cap, ...getSamplingParams(dataset.count, cfg) }
  if (query.count === 'exact') return null
  // the default: only page-1 ranked text searches (q present, _score is the primary sort —
  // commons.ts appends _score only when there is a q and no explicit sort) on large datasets
  if (dataset.count < cfg.minDatasetSize) return null
  if (!String(query.q ?? query._c_q ?? '').trim()) return null
  if (query.sort || query.collapse) return null
  return { cap: cfg.cap, ...getSamplingParams(dataset.count, cfg) }
}

/** Extrapolate the sample-slice count; the first request saw relation "gte", so never report ≤ cap. */
export const extrapolateApproxTotal = (sampledCount: number, mode: ApproxCountMode): number =>
  Math.max(mode.cap + 1, Math.round(sampledCount / mode.probability))

/**
 * Margin of error of a sampled estimate, in percent (meta.totalMarginPct): the ~95 %
 * confidence half-width of a binomial sample, ±1.96/√samples, rounded UP to a whole percent
 * and clamped to [1, 100] — presented as a margin, never as a hard bound.
 */
export const estimateMarginPct = (sampledCount: number): number =>
  sampledCount > 0 ? Math.min(100, Math.max(1, Math.ceil(100 * 1.96 / Math.sqrt(sampledCount)))) : 100

// ---- q_mode extension: or|and|adapt on top of legacy simple|complete ----

export type QMode = 'simple' | 'complete' | 'and' | 'adapt'

// adapt is the default: on large datasets, ranked multi-word searches ignore their
// over-common words in filtering (never below the cap — see adaptive-q.ts); everywhere
// else adapt degrades to plain OR, so small/filtered/exact requests behave as always.
export const DEFAULT_Q_MODE = 'adapt'

export const parseQMode = (raw: string | undefined, dflt: string): QMode => {
  const value = raw ?? dflt
  if (value === 'or' || value === 'simple') return 'simple'
  if (value === 'complete' || value === 'and' || value === 'adapt') return value
  throw httpError(400, `q_mode invalide "${value}" — valeurs acceptées : simple (ou or), complete, and, adapt`)
}

/**
 * Parse and validate q_required — the words a search must match (the non-scoring filter of
 * the score-broad-match-strict shape; pinned by q_mode=adapt in next links, or set
 * manually). Every word must be a whitespace token of q, else 400.
 */
export const parseQRequired = (q: string, raw: string): string[] => {
  const qWords = new Set(q.split(/\s+/))
  const words = String(raw).split(',').map(word => word.trim()).filter(Boolean)
  for (const word of words) {
    if (!qWords.has(word)) throw httpError(400, `Le paramètre q_required contient "${word}" qui n'est pas un mot de la recherche q.`)
  }
  return words
}

// Sampling-noise margin (~2σ at MIN_BOUNDARY_SAMPLES) protecting the never-below-cap
// invariant: a candidate qualifies only when its estimate clears cap × this margin, so a
// candidate whose TRUE total sits slightly below the cap cannot be chosen through sampling
// noise. A statistical constant, deliberately not configuration.
export const ADAPT_FLOOR_SAFETY = 1.2

/**
 * Pick the strictest candidate whose sampled support clears floorSample — or the last
 * (loosest) candidate when none does. THE INVARIANT: adapt never tightens a search below
 * the exactness horizon (the track_total_hits cap): floorSample = cap × probability ×
 * ADAPT_FLOOR_SAFETY, so a qualifying candidate always represents ≥ cap real matches, with
 * statistical confidence (≥ ~100 samples). Candidates are ordered strictest-first by the
 * caller (see adaptive-q.ts).
 */
export const chooseStrictestCandidate = <T extends { sampledCount: number }> (
  candidates: T[],
  floorSample: number
): T => {
  return candidates.find(candidate => candidate.sampledCount >= floorSample) ?? candidates[candidates.length - 1]
}
