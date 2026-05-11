import { type Request } from 'express'

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
export const queryAdvice = (req: Request & { dataset?: { schema?: any[] } }): string => {
  const q: Record<string, any> = req.query || {}
  const keys: string[] = []

  // 1. exact total-hits count on a list endpoint
  if (isLinesOrRecords(req.path) && q.count !== 'false' && q.count !== 'estimate' && !q.after) {
    keys.push('errors.queryAdviceCount')
  }
  // 2. deep offset pagination
  if (num(q.from) >= 1000) keys.push('errors.queryAdviceDeepPagination')
  // 3. large aggregation fan-out
  if (num(q.agg_size) >= 100 || nbLevels(q.field) > 1) keys.push('errors.queryAdviceAggSize')
  // 4. large page size
  if (num(q.size) >= 1000) keys.push('errors.queryAdviceSize')
  // 5. wide dataset fetched without a select (only when the dataset is loaded on the request)
  if ((req.dataset?.schema?.length ?? 0) > 20 && !q.select) keys.push('errors.queryAdviceSelect')

  if (keys.length === 0) return ''
  return ' ' + req.__('errors.queryAdviceIntro') + ' : ' + keys.map(k => req.__(k)).join(' ; ') + '.'
}
