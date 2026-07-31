import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.ts'
import { tooLongError, type ApproxCountMode, extrapolateApproxTotal, estimateMarginPct } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'
import { type EsAbortContext, timedEsCall } from './abort.ts'

// Estimate the total that the capped ranked request declined to compute exactly: count the
// matches inside the stable `_rand < randBound` slice (uniform random integer assigned at
// index time) and extrapolate by 1/probability. Filter context + size 0: no scoring,
// leapfrogs via the _rand BKD index, and eligible for the ES shard request cache on
// repeated queries. ES 7.x-compatible on purpose — do NOT switch to the random_sampler
// aggregation (ES ≥ 8.2 only).
export interface ApproxTotal {
  total: number
  /** margin of error in percent (~95 % confidence, rounded up) — becomes meta.totalMarginPct */
  marginPct: number
}

export const approxTotal = async (client: Client, dataset: any, query: Record<string, any>, mode: ApproxCountMode, abortContext?: EsAbortContext): Promise<ApproxTotal> => {
  const esQuery = prepareQuery(dataset, query)
  const body = {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [esQuery.query, { range: { _rand: { lt: mode.randBound } } }] } }
  }
  const res = await timedEsCall(abortContext, () => client.transport.request({
    method: 'POST',
    path: `/${aliasName(dataset)}/_search`,
    body,
    querystring: {
      allow_partial_search_results: 'false',
      timeout: config.elasticsearch.searchTimeout
    }
  }, { ...abortContext, meta: true }))
  const esResponse: any = (res as any).body
  if (esResponse.timed_out) throw httpError(tooLongError.status, tooLongError.message)
  const sampled = esResponse.hits.total.value
  return { total: extrapolateApproxTotal(sampled, mode), marginPct: estimateMarginPct(sampled) }
}
