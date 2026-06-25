import { type Request } from 'express'
import i18n from 'i18n'
import { hasManyQSearchFields, FILTER_CAPABILITIES, isLengthLimitedKeyword, hasCapability, KEYWORD_IGNORE_ABOVE } from '../../datasets/es/operations.ts'
import { SLOW_REQUEST_THRESHOLD_MS } from './observe.ts'
import { reqPublicOperation, reqDatasetOptional, setReqDataset } from './req-context.ts'

// Builds a short, localized, advisory sentence appended to overload errors (429 compute-budget,
// 504 "request too long", 429 ES circuit_breaking_exception). It only ever *advises* — it never
// changes the query. Shaped for the native dataset API query params; ODS-compat requests use
// different param names so most rules just don't fire for them (the `count` rule still recognises
// the `.../records` path). See docs/architecture/load-management.md.

const num = (v: any): number => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : NaN
}

// the native /values_agg `field` (and `agg_size`) params separate nested levels with ; or ,
const nbLevels = (v: any): number => v ? String(v).split(/[;,]/).filter(Boolean).length : 0

const isLinesOrRecords = (path: string): boolean => /\/(lines|records)\/?$/.test(path)

/**
 * Returns either '' or ' <intro> : <item> ; <item>.' assembled from i18n keys (via `req.__`).
 * Safe to concatenate onto any error message — '' when nothing useful applies.
 */
export const queryAdvice = (req: Request): string => {
  const q: Record<string, any> = req.query || {}
  const dataset = reqDatasetOptional(req)
  const keys: string[] = []

  // 1. exact total-hits count on a list endpoint
  if (isLinesOrRecords(req.path) && q.count !== 'false' && q.count !== 'estimate' && !q.after) {
    keys.push('errors.queryAdviceCount')
  }
  // 2. deep offset pagination (native API: page, 1-based; ODS-compat: offset)
  if (num(q.page) >= 100 || num(q.offset) >= 1000) keys.push('errors.queryAdviceDeepPagination')
  // 3. large aggregation fan-out
  if (num(q.agg_size) >= 100 || nbLevels(q.field) > 1) keys.push('errors.queryAdviceAggSize')
  // 4. large page size
  if (num(q.size) >= 1000) keys.push('errors.queryAdviceSize')
  // 5. wide dataset fetched without a select (only when the dataset is loaded on the request); select=* == all fields
  if ((dataset?.schema?.length ?? 0) > 20 && (!q.select || q.select === '*')) keys.push('errors.queryAdviceSelect')
  // 6. wide dataset full-text-searched without restricting the searched columns
  if ((q.q || q._c_q) && !q.q_fields && hasManyQSearchFields(dataset?.schema)) keys.push('errors.queryAdviceQFields')

  if (keys.length === 0) return ''
  return ' ' + req.__('errors.queryAdviceIntro') + ' : ' + keys.map(k => req.__(k)).join(' ; ') + '.'
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
  'q', 'q_fields', 'q_mode', 'qs', 'highlight',
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
 * signal: attachQueryHint emits it regardless of query duration, still suppressed by hint=false.
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
        items.push(req.__('errors.queryAdviceConceptUseColumn', key, inner + suffix)) // Tier 1: typo
      } else {
        items.push(req.__('errors.queryAdviceConceptUnknown', key)) // Tier 2: inert
      }
    } else {
      items.push(req.__('errors.queryAdviceUnknownParam', key))
    }
  }

  if (!items.length) return ''
  return ' ' + req.__('errors.queryAdviceIgnoredIntro') + ' : ' + items.join(' ; ') + '.'
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
  const items = [...flagged].map(k => req.__('errors.queryAdviceUncertainFilter', k, String(KEYWORD_IGNORE_ABOVE)))
  return ' ' + req.__('errors.queryAdviceUncertainIntro') + ' : ' + items.join(' ; ') + '.'
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
 * Returns the result with a `hint` string field prepended (so it appears first in the JSON) when
 * the request opted in (or the ES step was slow enough in auto mode) and at least one rule matches.
 * Returns `result` unchanged for `hint=false` or when no rule applies. The hint reuses the exact
 * same `queryAdvice` rules that drive the 429/504 error advice.
 *
 * Public/cacheable responses are served without varying by the i18n_lang cookie, so for those we
 * force the hint to English to avoid the reverse-proxy serving a French hint to an English client
 * (or vice versa) from cache.
 */
export const attachQueryHint = <T extends Record<string, any>> (
  req: Request,
  esStepDurationMs: number,
  result: T
): T => {
  const mode = parseHintMode(req.query?.hint)
  if (mode === 'false') return result
  let adviceReq: Request = req
  if (reqPublicOperation(req)) {
    // public/cacheable responses don't vary by the i18n_lang cookie → force English so the
    // reverse-proxy cache can't serve a French hint to an English client (or vice versa).
    const englishReq = {
      path: req.path,
      query: req.query,
      __: (key: string, ...args: any[]) => i18n.__({ phrase: key, locale: 'en' }, ...args)
    } as any
    const dataset = reqDatasetOptional(req)
    if (dataset) setReqDataset(englishReq, dataset)
    adviceReq = englishReq
  }
  // correctness advice (misused/ignored params) is duration-independent — always on unless hint=false
  const ignored = [ignoredParamsAdvice(adviceReq).trim(), uncertainFilterAdvice(adviceReq).trim()].filter(Boolean).join(' ')
  // performance advice keeps its slow-auto / explicit-true gate
  const perf = shouldEmitHint(mode, esStepDurationMs) ? queryAdvice(adviceReq).trim() : ''
  const advice = [ignored, perf].filter(Boolean).join(' ')
  if (!advice) return result
  return { hint: advice, ...result }
}
