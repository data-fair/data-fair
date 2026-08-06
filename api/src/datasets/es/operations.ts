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
// The analyzed leg is a UNION of both analyzed views (design §4): legacy indexes carry
// `.text_standard` (and `.text`), new-shape indexes carry only `.text`. Unmapped fields are silently
// ignored by ES search clauses, so listing both is safe on either shape and needs no shape branch.
export const resolveExistsFields = (prop: any, flagged: boolean): string[] => {
  if (!isLengthLimitedKeyword(prop) || !flagged) return [prop.key]
  if (hasCapability(prop, 'wildcard')) return [prop.key + '.wildcard']
  const fields = [prop.key]
  if (hasCapability(prop, 'textStandard')) fields.push(prop.key + '.text_standard')
  if (hasCapability(prop, 'text')) fields.push(prop.key + '.text')
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

// The mapping-emission shape esProperty / buildIndexMappings produce. Persisted per dataset as
// `_indexShape` when its index is (re)built, and read back here for every later emission and for
// query-time routing — see docs/superpowers/specs/2026-08-06-text-indexing-repeat-design.md §3.
export interface IndexShape {
  singleTextField?: boolean
  wordAggField?: boolean
}

// Derives the text-analyzer family from the single configured `defaultAnalyzer` by naming
// convention: `<defaultAnalyzer>_repeat` (index-side analyzer of the single analyzed `.text`
// sub-field) and `<defaultAnalyzer>_exact` (search-side analyzer of the exact-match boost clause).
// The shipped `custom_french` family is defined this way in `indexBase`
// (api/src/datasets/es/manage-indices.ts); an override must define all three analyzers there or
// index creation fails loudly with an unknown-analyzer error. Pure.
export const textAnalyzers = (defaultAnalyzer: string) => ({
  search: defaultAnalyzer,
  index: defaultAnalyzer + '_repeat',
  exact: defaultAnalyzer + '_exact'
})

// Weight of the exact-match boost clause. A deliberate static: the boost intensity is a design
// decision, not an ops knob — changing it is a code release, and it only affects query scoring
// (no reindex required).
export const EXACT_MATCH_BOOST = 0.5

// New-shape indexes (spec 2026-08-06 §1, default): one analyzed `.text` field per column
// (index analyzer indexes original + stem via keyword_repeat, search_analyzer walks only the
// stem), plus `.words` on textAgg columns.
export const NEW_INDEX_SHAPE: IndexShape = Object.freeze({ singleTextField: true, wordAggField: true })
// Legacy indexes: today's dual `.text` (defaultAnalyzer) + `.text_standard` (standard) analyzed
// fields — the emission every existing index carries until its next reindex. Byte-for-byte
// today's behavior, pinned by a unit test.
export const LEGACY_INDEX_SHAPE: IndexShape = Object.freeze({})

// The shape a mapping must be emitted with for an EXISTING index: the one this dataset's index was
// built with, read from its `_indexShape` stamp (absent = legacy, uniform polarity — design §3).
// This is `indexDefinition`'s default and therefore what partial mapping updates use, keeping
// every index internally homogeneous: a column added to a legacy index is emitted legacy-shaped
// and does NOT stamp the dataset. Fresh index creation bypasses it and passes NEW_INDEX_SHAPE.
export const currentIndexShape = (dataset: { _indexShape?: IndexShape }): IndexShape => dataset._indexShape ?? LEGACY_INDEX_SHAPE

// Dummy analyzer strings for callers that only inspect which inner fields a mapping would carry
// (hasManyQSearchFields, getFilterableFields, isMetricAggregatable, the unit-test paths) — the
// actual analyzer values only matter to `manage-indices` (the ES mapping creator).
const DUMMY_ANALYZERS = { search: '', index: '' }

// From a property in data-fair schema to the property in an elasticsearch mapping.
// `analyzers.index` / `analyzers.search` end up on the new-shape single `.text` field (index vs
// search_analyzer); under the legacy shape `analyzers.search` alone is the (single) analyzer of
// `.text`, mirroring today's `defaultAnalyzer`. `shape` picks the emission shape — see
// NEW_INDEX_SHAPE / LEGACY_INDEX_SHAPE above.
export const esProperty = (prop: any, analyzers: { search: string, index: string }, shape: IndexShape = NEW_INDEX_SHAPE): any => {
  const capabilities = prop['x-capabilities'] || {}
  const isFullTextString = prop.type === 'string' && (prop.format === 'uri-reference' || !prop.format)
  // Add inner text field to almost everybody so that even dates, numbers, etc can be matched textually as well as exactly.
  // Non-string columns never had `.text` and keep `.text_standard` under BOTH shapes; string/
  // uri-reference columns get `.text_standard` only under the legacy shape — the new shape
  // replaces it with the single `.text` field emitted below.
  const innerFields: any = {}
  if (capabilities.textStandard !== false && (!isFullTextString || !shape.singleTextField)) {
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
  if (isFullTextString) {
    const textFieldData = capabilities.textAgg
    if (shape.singleTextField) {
      if (capabilities.text !== false) {
        // single analyzed field: original AND stemmed tokens indexed (keyword_repeat),
        // queries walk only the stem list (search_analyzer) — spec 2026-08-06 §1
        innerFields.text = { type: 'text', analyzer: analyzers.index, search_analyzer: analyzers.search }
      } else if (capabilities.textStandard !== false) {
        // `text: false` = the owner explicitly refused language analysis on this column, so the
        // single field must be the UNSTEMMED one — and it keeps its legacy NAME `.text_standard`.
        // That name choice is load-bearing: the query layer derives its field lists from the
        // legacy emission (getFilterableFields) and unions the two names, so emitting `.text`
        // here would drop the column out of `q`/`qs` entirely on a new-shape index. Same
        // definition as the legacy subfield — no fielddata (aggregation goes through `.words`).
        innerFields.text_standard = { type: 'text', analyzer: 'standard' }
      }
      if (shape.wordAggField && capabilities.textAgg) {
        // aggregation-optimized field for words_agg (opt-in textAgg columns only):
        // stemmed-only tokens for merged buckets, no positions/norms (agg never scores)
        innerFields.words = { type: 'text', analyzer: analyzers.search, index_options: 'docs', norms: false, fielddata: true }
      }
    } else {
      if (capabilities.textStandard !== false) {
        innerFields.text_standard.fielddata = textFieldData
      }
      if (capabilities.text !== false) {
        // language based analysis for better recall with stemming, etc
        innerFields.text = { type: 'text', analyzer: analyzers.search, fielddata: textFieldData }
      }
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
  // shape-independent: esProp.type / doc_values never differ between shapes, only .fields.text*
  // does, so any shape works here — DUMMY_ANALYZERS (default NEW shape) keeps this cheap.
  const esProp = esProperty(prop, DUMMY_ANALYZERS)
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
// their original `^3` / `^2` weight. We count analyzed inner sub-fields (what actually inflates
// the `fields` array) rather than the columns. See docs/architecture/load-management.md.
//
// BOTH the count and the threshold are SHAPE-DEPENDENT, and they must stay paired: a new-shape
// index emits at most ONE analyzed inner field per column (`.text`), a legacy one up to two
// (`.text` + `.text_standard`). 15 and 30 are the SAME boundary expressed in each shape's unit
// for a default string column (16 columns: legacy 32>30, new 16>15). Counting in one shape's unit
// against the other's threshold silently reclassifies scalar-heavy datasets — see
// `hasManyQSearchFields` below.
export const Q_SEARCH_FIELDS_THRESHOLD = 15
// same boundary, in legacy (dual inner field) units — applies to every index not yet rebuilt
export const LEGACY_Q_SEARCH_FIELDS_THRESHOLD = 30
export const qSearchFieldsThreshold = (shape: IndexShape): number =>
  shape.singleTextField ? Q_SEARCH_FIELDS_THRESHOLD : LEGACY_Q_SEARCH_FIELDS_THRESHOLD

// boost-eligible columns keep a per-field entry (with `^3` / `^2`) in qSearchFields in every
// regime — so they don't contribute to the catch-all's savings and don't `copy_to` it either.
const BOOST_REFERS_TO = new Set([
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://schema.org/description',
  'https://schema.org/DefinedTermSet'
])
export const isBoostEligible = (prop: any): boolean => BOOST_REFERS_TO.has(prop['x-refersTo'])

// Wide/narrow classification of a schema, for a GIVEN index shape. Wideness drives emission
// (`_search` + `copy_to` in buildIndexMappings), the stored `_esCopyToSearch` flag and the query
// -time `reduced` regime — all of which describe one concrete index, so they must all be resolved
// against the shape THAT index was built with (`currentIndexShape(dataset)`), never against a
// version-independent constant. Classifying a legacy index with new-shape units both flips its
// `reduced` regime at deploy (ranking change on an untouched index) and, worse, makes both sides
// of `updateDatasetMapping`'s crossing guards agree on `wide:true` so `_search` + `copy_to` get
// added IN PLACE to a legacy index — accepted by ES, never back-filled, `q` then answers from an
// empty catch-all. Default shape is NEW like `esProperty`'s, for callers that legitimately ask
// "how would a freshly built index classify this schema?".
export const hasManyQSearchFields = (schema: any, shape: IndexShape = NEW_INDEX_SHAPE): boolean => {
  if (!schema) return false
  let n = 0
  for (const f of schema) {
    if (f.key === '_id') continue
    // boost-eligible columns are always referenced per-field, so they don't benefit from `_search`
    if (isBoostEligible(f)) continue
    const esProp = esProperty(f, DUMMY_ANALYZERS, shape)
    if (!esProp || !esProp.fields) continue
    if (esProp.fields.text) n++
    if (esProp.fields.text_standard) n++
  }
  return n > qSearchFieldsThreshold(shape)
}

// CAUTION for any routing migration: a column with no analyzed subfield (text and textStandard
// both disabled) is NOT "out of `q`". getFilterableFields still routes such string columns to
// their keyword view (`.keyword_insensitive`, else the keyword main type), and routes `.wildcard`
// independently of analysis. Dropping either when rewiring the fanout is a silent recall
// regression — guarded by q-fields.unit, q-keyword-insensitive.api and q-wildcard-column.api.
export const getFilterableFields = memoize((dataset: any, hasQ: any, qFields: any) => {
  const searchFields: string[] = []
  const wildcardFields: string[] = []
  const qSearchFields: string[] = []
  const qStandardFields: string[] = []
  // the analyzed `.text` views alone (with their boost suffixes). Two new-shape-only consumers:
  // the exact-match boost clause (query-time `custom_french_exact`) and q_mode=complete's prefix
  // clause, which on a `singleTextField` index has no `.text_standard` to run on. Both are gated
  // on `dataset._indexShape?.singleTextField` in buildQClauses — this list is always computed but
  // stays unused on legacy datasets.
  const qExactFields: string[] = []
  const qWildcardFields: string[] = []
  const esFields: string[] = []

  // pick the `q` regime (only when no explicit q_fields was requested)
  const copyToSearch = !!hasQ && !qFields && dataset._esCopyToSearch === true
  // wideness follows the dataset's OWN index, like every other emission decision: a legacy index
  // keeps the classification it had before the single-field rework until it is actually rebuilt
  const reduced = !!hasQ && !qFields && !copyToSearch && hasManyQSearchFields(dataset.schema, currentIndexShape(dataset))

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
    // LEGACY shape ON PURPOSE, whatever the dataset's own `_indexShape`: the search path is a
    // uniform UNION of both emissions' field names (design §4). Deriving the lists from the
    // legacy emission yields that union — on a new-shape index the extra `.text_standard` entries
    // are unmapped and silently ignored by simple_query_string, on a legacy one they carry the
    // behavior. The few shape-gated consumers (exact-boost clause, complete-mode prefix) branch
    // in buildQClauses instead. Guarded by q-fields.unit / q-keyword-insensitive.api /
    // q-wildcard-column.api.
    const esProp = esProperty(f, DUMMY_ANALYZERS, LEGACY_INDEX_SHAPE)
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

      if (esProp.fields.text) {
        searchFields.push(f.key + '.text' + suffix)
        if (perField) {
          qSearchFields.push(f.key + '.text' + suffix)
          qExactFields.push(f.key + '.text' + suffix)
        }
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
    }
  }

  if (copyToSearch) {
    qSearchFields.push('_search')
    qStandardFields.push('_search.text_standard')
    // on a new-shape index `_search` IS the single analyzed field (no `.text_standard` twin)
    qExactFields.push('_search')
  }

  return { searchFields, wildcardFields, qSearchFields, qStandardFields, qExactFields, qWildcardFields, esFields, copyToSearch, reduced }
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
// `exactMatch` (new-shape only, resolved by the caller from config) adds the scoring-only
// exact-match boost clause. It carries a query-time `analyzer:` reference, which MUST exist in
// the target index's settings — sending it at a legacy index 400s. Hence the caller gates it on
// `dataset._indexShape?.singleTextField`; legacy datasets need no clause anyway, their
// `.text_standard` union clause already is the (untuned) exact boost. See design §1/§5.1.
export const buildQClauses = (
  dataset: any,
  q: string,
  qFields: string[] | undefined,
  qMode: string | undefined,
  sqsOptions: any = {},
  ignoredWords?: string[],
  exactMatch?: { analyzer: string, boost: number }
): any => {
  const { qSearchFields, qStandardFields, qExactFields, qWildcardFields, reduced } = getFilterableFields(dataset, q, qFields)
  const should: any[] = []
  if (qMode === 'complete') {
    // "complete" mode, we try to accomodate for most cases and give the most intuitive results
    // to a search query where the user might be using a autocomplete type control

    // if the user didn't define wildcards himself, we use wildcard to create a "startsWith" functionality
    // this is performed on the innerfield that uses standard analysis, as language stemming doesn't work well in this case
    // we also perform a contains filter if some wildcard functionnality is activate
    if (!q.includes('*') && !q.includes('?')) {
      // on a legacy index the prefix ladder lives ENTIRELY in `.text_standard` (verified: legacy
      // `.text` alone fails the mid-typing ladder), so the legacy branch stays literally today's
      // list. A new-shape index drops `.text_standard` only on FULL-TEXT STRING columns — its
      // `.text` indexes the original tokens alongside the stems, so the prefix works there and
      // prefix terms are never stemmed away — but scalar/date columns still carry a mapped
      // `.text_standard`. Hence the union: the string `.text_standard` entries are unmapped and
      // silently ignored by simple_query_string, the scalar ones keep autocomplete alive on
      // integer/number/date columns.
      const prefixFields = dataset._indexShape?.singleTextField ? [...qExactFields, ...qStandardFields] : qStandardFields
      if (prefixFields.length) {
        should.push({ simple_query_string: { query: `${q}*`, fields: prefixFields, ...sqsOptions } })
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
    // scoring-only exact-match boost (new shape only, see the exactMatch doc above): same fields,
    // but analyzed without stemming so a literal term match outranks a merely stem-equal one.
    // Deliberately NOT added in complete mode (its prefix/phrase clauses carry their own
    // semantics — design §7 leaves the twin as a possible later tuning).
    if (exactMatch && qExactFields.length) {
      should.push({ simple_query_string: { query: q, fields: qExactFields, analyzer: exactMatch.analyzer, boost: exactMatch.boost, ...sqsOptions } })
    }
  }
  const scored = { bool: { should, minimum_should_match: 1 } }

  // "score broad, match strict": q_mode=and and q_ignored tighten the MATCH SET through a
  // non-scoring filter while scores stay pure OR — the page is OR's page restricted to the
  // tightened set, and the filter leads the iteration. For q_ignored the filter is the OR
  // of the retained (non-ignored) words: the match set is the plain OR minus docs that
  // only matched ignored words — ignored words keep scoring. Requirements must NEVER move
  // into scoring position (measured 2.5× slower on ES 7, see load-management.md §9).
  // Not composed with `complete` mode (its prefix/wildcard clauses carry their own semantics).
  if (qMode !== 'complete') {
    const matchFields = reduced ? qSearchFields : [...qSearchFields, ...qStandardFields]
    if (qMode === 'and' && matchFields.length) {
      return { bool: { must: [scored], filter: [{ simple_query_string: { query: q, fields: matchFields, default_operator: 'and' } }] } }
    }
    if (ignoredWords?.length && matchFields.length) {
      const retained = [...new Set(q.split(/\s+/))].filter(word => !ignoredWords.includes(word))
      return {
        bool: {
          must: [scored],
          filter: [{ bool: { should: retained.map(word => ({ multi_match: { query: word, fields: matchFields } })), minimum_should_match: 1 } }]
        }
      }
    }
  }
  return scored
}

// Pure mapping builder used by manage-indices.indexDefinition. Given the already-extended
// schema and the analyzers/shape, returns the `properties` shape — including the catch-all
// `_search` field and `copy_to` annotations on non-boost-eligible text columns.
export const buildIndexMappings = (
  dataset: any,
  jsProps: any[],
  analyzers: { search: string, index: string },
  shape: IndexShape = NEW_INDEX_SHAPE
): { properties: Record<string, any>, wide: boolean } => {
  const properties: Record<string, any> = {}
  // CSV-equivalent byte size of the line, summed by storage() for the indexed_bytes
  // metric. Aggregated only (doc_values), never searched.
  properties._bytes = { type: 'integer', index: false }
  // classified in the units of the shape we are emitting — the caller resolved it from the target
  // index (`currentIndexShape` for a partial update, NEW_INDEX_SHAPE for a fresh build)
  const wide = hasManyQSearchFields(jsProps, shape)
  if (wide) {
    if (shape.singleTextField) {
      // single analyzed field, same treatment as every other column under the new shape
      properties._search = { type: 'text', analyzer: analyzers.index, search_analyzer: analyzers.search }
    } else {
      properties._search = {
        type: 'text',
        analyzer: analyzers.search,
        fields: { text_standard: { type: 'text', analyzer: 'standard' } }
      }
    }
  }
  for (const jsProp of jsProps) {
    const esProp = esProperty(jsProp, analyzers, shape)
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
  // present once the projection that resolves descendants requests it (see
  // `datasets/utils/virtual.ts` `descendants(dataset, extraProperties)`); absent = not requested,
  // never confuse with "requested and legacy" (which is `{}`, per the uniform-polarity rule §3).
  _indexShape?: IndexShape
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

// Routes words_agg to the field carrying the aggregation-optimized subfield for the dataset's
// index shape (design §3-§4). `_indexShape.wordAggField` is stamped whenever a FRESH index is
// built (the indexer worker, the REST creation route, deleteAllLines) — never by a partial
// mapping update; a virtual dataset gets it AND-merged from its descendants at finalize. Absent =
// legacy, per the uniform-polarity rule, so an unstamped dataset resolves exactly like before the
// rework. For a virtual dataset the flag must be uniform across every resolved
// descendant: aggregations have no union across heterogeneous shapes (an unmapped `.words` field
// on some children would silently return zero buckets from those children, not an error), so a
// mixed-shape virtual dataset is refused loudly (400) rather than answering partially — never
// inferred, never silent (design §3 rule). Pure: reads only the already-resolved `dataset` /
// `query` shapes, so it is unit-testable independently of the ES call.
export const resolveWordsAggField = (dataset: any, query: Record<string, any>): string => {
  if (dataset.isVirtual) {
    const shapes = (dataset.descendants ?? []).map((d: QueryableDescendant) => d._indexShape?.wordAggField === true)
    if (shapes.length && shapes.every(Boolean)) return query.field + '.words'
    if (shapes.some(Boolean)) {
      throw httpError(400, 'Cette agrégation est indisponible tant que les jeux enfants ne sont pas tous ré-indexés dans un format homogène.')
    }
    return query.analysis === 'standard' ? query.field + '.text_standard' : query.field + '.text'
  }
  if (dataset._indexShape?.wordAggField) {
    if (query.analysis === 'standard') throw httpError(400, 'Le paramètre analysis=standard n\'est plus disponible sur ce jeu de données, l\'analyse suit la langue de la colonne.')
    return query.field + '.words'
  }
  return query.analysis === 'standard' ? query.field + '.text_standard' : query.field + '.text'
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
 * Parse and validate q_ignored — the words excluded from the non-scoring filter of the
 * score-broad-match-strict shape (they keep scoring); pinned by q_mode=adapt in next
 * links, or set manually. Every word must be a whitespace token of q, and at least one
 * word of q must remain retained, else 400.
 */
export const parseQIgnored = (q: string, raw: string): string[] => {
  const qWords = new Set(q.split(/\s+/))
  const words = String(raw).split(',').map(word => word.trim()).filter(Boolean)
  for (const word of words) {
    if (!qWords.has(word)) throw httpError(400, `Le paramètre q_ignored contient "${word}" qui n'est pas un mot de la recherche q.`)
  }
  if (new Set(words).size >= qWords.size) throw httpError(400, 'Le paramètre q_ignored ne peut pas couvrir tous les mots de la recherche q.')
  return words
}

export interface OrAdaptCandidate {
  /** the words dropped from filtering, most frequent first */
  ignored: string[]
  /** the words whose OR forms the non-scoring filter */
  retained: string[]
  /** sampled size of the retained union; null = needs an ES count (bounds could not decide) */
  sampledCount: number | null
}

/**
 * Candidates for OR-of-retained adapt, ordered strictest-first: ignore the k most frequent
 * words, k = words.length-1 … 0 (k=0 = nothing ignored, the plain OR — always last).
 * Union-size bounds fill sampledCount without an ES count where they can: a single
 * retained word IS its solo count; union ≤ sum(solo) < floor disqualifies; union ≥
 * max(solo) ≥ floor qualifies outright — and since every stricter candidate already
 * failed, that candidate will be chosen, so the walk stops there (its exact sampled count
 * is still needed, for the display total). Measured to eliminate the second probe in most
 * real queries — benchmark/INVESTIGATIONS.md §14 finding 3.
 */
export const buildOrAdaptCandidates = (
  words: string[],
  soloSampledCount: Record<string, number>,
  orSampledCount: number,
  floorSample: number
): OrAdaptCandidate[] => {
  const byFreq = [...words].sort((a, b) => soloSampledCount[b] - soloSampledCount[a])
  const candidates: OrAdaptCandidate[] = []
  for (let k = words.length - 1; k >= 1; k--) {
    const candidate: OrAdaptCandidate = { ignored: byFreq.slice(0, k), retained: byFreq.slice(k), sampledCount: null }
    candidates.push(candidate)
    const solos = candidate.retained.map(word => soloSampledCount[word])
    const max = Math.max(...solos)
    const sum = solos.reduce((a, b) => a + b, 0)
    if (candidate.retained.length === 1) {
      candidate.sampledCount = solos[0]
      if (solos[0] >= floorSample) break
    } else if (sum < floorSample) {
      candidate.sampledCount = sum // disqualified either way — the ≤-bound is enough
    } else if (max >= floorSample) {
      break // qualified outright: chosen; only its display total still needs counting
    }
  }
  candidates.push({ ignored: [], retained: byFreq, sampledCount: orSampledCount })
  return candidates
}

// Sampling-noise margin (~2σ at MIN_BOUNDARY_SAMPLES) protecting the never-below-cap
// invariant: a candidate qualifies only when its estimate clears cap × this margin, so a
// candidate whose TRUE total sits slightly below the cap cannot be chosen through sampling
// noise. A statistical constant, deliberately not configuration.
export const ADAPT_FLOOR_SAFETY = 1.2

/**
 * Minimum "bite" for an adapt ignore-set: the retained union must exclude at least 2 % of
 * the sampled OR set, else filtering is pointless overhead (phrase-like queries whose
 * words co-occur) and adapt reports nothing ignored. Both counts are nested on the same
 * sample slice — the comparison is exact. A UX constant, deliberately not configuration.
 */
export const ADAPT_MIN_BITE = 0.98

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
