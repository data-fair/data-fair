import { type Request } from 'express'
import config from '#config'
import { hasManyQSearchFields, currentIndexShape, FILTER_CAPABILITIES, isLengthLimitedKeyword, hasCapability, KEYWORD_IGNORE_ABOVE, getSimpleMetricsFields, getCountMode } from '../../datasets/es/operations.ts'
import { SLOW_REQUEST_THRESHOLD_MS } from './observe.ts'
import { reqDatasetOptional } from './req-context.ts'

// Builds short advisory sentences: meta.hints entries on the data endpoints and a suffix on
// overload errors (429 compute-budget, 504 "request too long", 429 ES circuit_breaking_exception).
// It only ever *advises* — it never changes the query. Shaped for the native dataset API query
// params; ODS-compat requests use different param names so most rules just don't fire for them
// (the `count` rule still recognises the `.../records` path). See docs/architecture/load-management.md.
//
// Deliberately NOT internationalized: the audience is developers, and public/cacheable responses
// can't vary by the language cookie anyway (the reverse-proxy cache would mix languages), so the
// advice is plain English everywhere. End users get localized UI built from the machine fields
// (meta.totalMarginPct, meta.ignoredWords), never from these strings.

const num = (v: any): number => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : NaN
}

// the native /values_agg `field` (and `agg_size`) params separate nested levels with ; or ,
const nbLevels = (v: any): number => v ? String(v).split(/[;,]/).filter(Boolean).length : 0

const isLinesOrRecords = (path: string): boolean => /\/(lines|records)\/?$/.test(path)

/**
 * Returns either '' or ' <intro>: <item>; <item>.' — safe to concatenate onto any error
 * message, '' when nothing useful applies.
 */
export const queryAdvice = (req: Request): string => {
  const q: Record<string, any> = req.query || {}
  const dataset = reqDatasetOptional(req)
  const items: string[] = []

  // 1. exact total-hits count on a list endpoint. Suppressed in approximate-count mode:
  // counting is already estimated there, and the estimate itself is DESCRIBED by the machine
  // fields (meta.totalMarginPct / meta.ignoredWords), never restated as advice — hints only
  // carry actionable suggestions.
  const countMode = dataset && isLinesOrRecords(req.path) && getCountMode(dataset, q, config.elasticsearch.approxCount)
  if (isLinesOrRecords(req.path) && q.count !== 'false' && q.count !== 'estimate' && !q.after && !countMode) {
    items.push('set count=estimate (exact total up to the threshold, then estimated by sampling) or count=false to skip the exact total-row count')
  }
  // 2. deep offset pagination (native API: page, 1-based; ODS-compat: offset)
  if (num(q.page) >= 100 || num(q.offset) >= 1000) items.push('use keyset pagination via the after parameter instead of deep page/offset navigation')
  // 3. large aggregation fan-out
  if (num(q.agg_size) >= 100 || nbLevels(q.field) > 1) items.push('reduce agg_size and/or the number of grouped fields')
  // 4. large page size
  if (num(q.size) >= 1000) items.push('request fewer results per page (lower size)')
  // 5. wide dataset fetched without a select (only when the dataset is loaded on the request); select=* == all fields
  if ((dataset?.schema?.length ?? 0) > 20 && (!q.select || q.select === '*')) items.push('use the select parameter to return only the columns you need')
  // 6. wide dataset full-text-searched without restricting the searched columns
  // classified with the index's own shape, same rule as getFilterableFields
  if ((q.q || q._c_q) && !q.q_fields && hasManyQSearchFields(dataset?.schema, currentIndexShape(dataset ?? {}))) items.push('restrict full-text search to the relevant columns with q_fields=col1,col2 instead of searching every column')

  if (items.length === 0) return ''
  return ' Advice to optimize your queries: ' + items.join('; ') + '.'
}

// Parameters recognized by the dataset data endpoints (/lines, /*_agg). Mirrors the query
// params declared in api/contract/dataset-api-docs.ts and consumed in es/commons.js and
// es/*-agg.js. Anything else is silently ignored by the API — surfaced via ignoredParamsAdvice.
// Keep in sync with those sources (the drift-guard unit test enumerates the documented set).
const FILTER_SUFFIXES = Object.keys(FILTER_CAPABILITIES)

const RECOGNIZED_PARAMS = new Set([
  // pagination / output shaping
  'size', 'page', 'after', 'count', 'select', 'sort', 'truncate', 'thumbnail', 'html', 'format', 'hint', 'draft',
  // full-text search
  'q', 'q_fields', 'q_mode', 'q_ignored', 'qs', 'highlight',
  // ownership / account scoping
  'owner', 'account',
  // geo / temporal (+ their _c_ concept forms)
  'bbox', 'geo_distance', 'date_match', 'xyz', 'wkt',
  '_c_q', '_c_bbox', '_c_geo_distance', '_c_date_match',
  // aggregations
  'agg_size', 'field', 'metric', 'metric_field', 'metrics', 'extra_metrics',
  'percents', 'precision_threshold', 'interval', 'calendar', 'missing', 'analysis', 'sampling',
  // output formatting / export / misc read params
  'collapse', 'arrays', 'explain', 'fields', 'mimeType', 'finalizedAt',
])

/**
 * Advisory for parameters the API silently ignored: a `_c_` concept prefix misapplied to a
 * column filter, an inert `_c_` filter that matched no concept, or an unrecognized/misspelled
 * parameter. Returns '' when nothing applies. Pure — reads only req.query + the dataset context schema.
 *
 * Unlike queryAdvice (a *performance* advisory gated on slow queries), this is a *correctness*
 * signal: buildQueryHints emits it regardless of query duration, still suppressed by hint=false.
 */
export const ignoredParamsAdvice = (req: Request): string => {
  const q: Record<string, any> = req.query || {}
  const schema = reqDatasetOptional(req)?.schema
  const columnKeys = new Set((schema ?? []).map((p: any) => p.key))
  const conceptIds = new Set((schema ?? []).filter((p: any) => p['x-concept']?.primary).map((p: any) => p['x-concept'].id))
  const items: string[] = []

  for (const key of Object.keys(q)) {
    if (RECOGNIZED_PARAMS.has(key)) continue
    const suffix = FILTER_SUFFIXES.find(s => key.endsWith(s))
    // a bare column filter (<columnKey><suffix> for a real column) is recognized
    if (suffix && !key.startsWith('_c_') && columnKeys.has(key.slice(0, key.length - suffix.length))) continue

    if (key.startsWith('_c_')) {
      const inner = key.slice(3, suffix ? key.length - suffix.length : key.length)
      if (suffix && conceptIds.has(inner)) continue // legit concept filter that resolved (suffix required; bare _c_<concept> is dropped by commons.js)
      if (suffix && columnKeys.has(inner)) {
        items.push(`${key} → use ${inner + suffix} instead (the _c_ prefix is reserved for concept filters, not columns)`) // Tier 1: typo
      } else {
        items.push(`${key} was ignored — the _c_ prefix is for concept filters and matched no concept in this dataset`) // Tier 2: inert
      }
    } else {
      items.push(`${key} is not a recognized query parameter and was ignored`)
    }
  }

  if (!items.length) return ''
  return ' Some parameters were ignored: ' + items.join('; ') + '.'
}

// Correctness advisory (duration-independent): a filter on a column that ACTUALLY dropped values
// (dataset._esIgnoredKeywordFields, from finalize detection) and has no length-safe alternative. Only
// the ops Task 5 cannot otherwise fix are flagged: _starts/range always; _exists/_nexists only when
// no analyzed sub-field exists. _eq/_in are operand-driven (already 400 on impossible) → never here.
const UNCERTAIN_SUFFIXES = ['_starts', '_gt', '_gte', '_lt', '_lte', '_exists', '_nexists']
export const uncertainFilterAdvice = (req: Request): string => {
  const q: Record<string, any> = req.query || {}
  const dataset = reqDatasetOptional(req)
  const flaggedSet = new Set<string>((dataset as any)?._esIgnoredKeywordFields ?? [])
  if (!flaggedSet.size) return ''
  const byKey = new Map((dataset?.schema ?? []).map((p: any) => [p.key, p]))
  const flagged = new Set<string>()

  for (const key of Object.keys(q)) {
    const suffix = UNCERTAIN_SUFFIXES.find(s => key.endsWith(s))
    if (!suffix) continue
    const colKey = key.slice(0, key.length - suffix.length)
    if (!flaggedSet.has(colKey)) continue
    const prop: any = byKey.get(colKey)
    if (!prop || !isLengthLimitedKeyword(prop)) continue
    if (hasCapability(prop, 'wildcard')) continue // Task 5 routes these to .wildcard
    if ((suffix === '_exists' || suffix === '_nexists') &&
        (hasCapability(prop, 'textStandard') || hasCapability(prop, 'text'))) continue // union covers it
    flagged.add(colKey)
  }

  if (!flagged.size) return ''
  // consumer-facing: state the limitation and the affected columns only — the "enable wildcard /
  // reprocess" fix is an owner/admin action surfaced via the diagnose warning and journal event.
  const items = [...flagged].map(k => `"${k}"`)
  return ` some filters may return incomplete results: values longer than ${KEYWORD_IGNORE_ABOVE} characters are not exactly indexed on the following column(s): ` + items.join(', ') + '.'
}

// Correctness advisory (duration-independent) for /simple_metrics_agg: the metrics read
// doc_values, which silently miss the values ES dropped on columns that exceeded ignore_above
// (dataset._esIgnoredKeywordFields, from finalize detection). Sibling of uncertainFilterAdvice
// for the aggregated columns rather than the filters.
export const truncatedMetricsAdvice = (req: Request): string => {
  if (!/\/simple_metrics_agg\/?$/.test(req.path)) return ''
  const dataset = reqDatasetOptional(req)
  const flaggedSet = new Set<string>((dataset as any)?._esIgnoredKeywordFields ?? [])
  if (!flaggedSet.size) return ''
  let fields: string[]
  try {
    fields = getSimpleMetricsFields(dataset, (req.query ?? {}) as Record<string, any>)
  } catch {
    return '' // invalid explicit fields/metrics 400 before any result could carry a hint
  }
  const byKey = new Map((dataset?.schema ?? []).map((p: any) => [p.key, p]))
  const affected = fields.filter(k => flaggedSet.has(k) && isLengthLimitedKeyword(byKey.get(k)))
  if (!affected.length) return ''
  const items = affected.map(k => `"${k}"`)
  return ` some metrics may be computed on incomplete data: values longer than ${KEYWORD_IGNORE_ABOVE} characters are not taken into account on the following column(s): ` + items.join(', ') + '.'
}

export type HintMode = 'auto' | 'true' | 'false'

/**
 * Pure decision: should a hint be attached given the requested mode and the elapsed ES step?
 * Extracted so it can be unit-tested without the rest of the request machinery.
 */
export const shouldEmitHint = (mode: HintMode, esStepDurationMs: number): boolean => {
  if (mode === 'false') return false
  if (mode === 'true') return true
  return esStepDurationMs > SLOW_REQUEST_THRESHOLD_MS
}

const parseHintMode = (raw: any): HintMode => (raw === 'true' || raw === 'false' ? raw : 'auto')

/**
 * The advisory sentences for a request, as an array of standalone entries (meta.hints):
 * correctness advisories (misused/ignored params, uncertain filters, truncated metrics) are
 * duration-independent; performance advice keeps its slow-auto / explicit-true gate. Empty
 * array for hint=false or when no rule applies. The same `queryAdvice` rules also drive the
 * 429/504 error advice (as a suffix sentence there, see rate-limiting.ts).
 */
export const buildQueryHints = (req: Request, esStepDurationMs: number): string[] => {
  const mode = parseHintMode(req.query?.hint)
  if (mode === 'false') return []
  const hints = [ignoredParamsAdvice(req).trim(), uncertainFilterAdvice(req).trim(), truncatedMetricsAdvice(req).trim()]
  if (shouldEmitHint(mode, esStepDurationMs)) hints.push(queryAdvice(req).trim())
  return hints.filter(Boolean)
}

/**
 * Merge the advisory entries into a result as `meta.hints` (creating or extending `meta`).
 * Returns the result unchanged when there is nothing to say — meta stays presence-as-signal.
 */
export const attachQueryHints = <T extends Record<string, any>> (
  req: Request,
  esStepDurationMs: number,
  result: T
): T => {
  const hints = buildQueryHints(req, esStepDurationMs)
  if (!hints.length) return result
  return { ...result, meta: { ...(result as any).meta, hints } }
}
