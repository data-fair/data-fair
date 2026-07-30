import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.ts'
import { tooLongError, type ApproxCountMode, extrapolateApproxTotal, decideAdaptiveRung, buildQClauses } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'
import { type EsAbortContext, timedEsCall } from './abort.ts'

// q_mode=adapt: exclude from FILTERING the most common query words — just enough of them that
// the filtered set stays above the exactness horizon (the track_total_hits cap) — while every
// word keeps scoring (see buildQClauses' score-broad-match-strict shape). The decision comes
// from ONE `_rand`-sliced size:0 request (per-word sampled counts via a filters agg + the
// sampled OR total from hits.total — 0-1ms warm, shard-request-cacheable, deterministic per
// dataset) plus, when multi-word rungs might qualify, one _msearch of rung conjunction counts.
//
// Outcomes (THE INVARIANT: searches totalling under the cap run exactly as today):
//   - OR estimate under the cap            → null (plain behaviour, exact total)
//   - the all-words rung clears the floor  → nothing ignored (ignored: [])
//   - some rung clears the floor           → { required: j rarest words, ignored: the rest }
//   - no rung clears the floor             → unrestricted (required: [], plain capped OR)
// In every non-null case `total` is the `_rand`-extrapolated estimate at the chosen rung, so
// the /lines pipeline needs no separate count leg.

export interface AdaptResult {
  required: string[]
  ignored: string[]
  total: number
  totalRelation: 'estimate'
}

const esSearch = async (client: Client, dataset: any, body: any, abortContext?: EsAbortContext): Promise<any> => {
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
  return esResponse
}

export const runAdaptivePreflight = async (client: Client, dataset: any, query: Record<string, any>, mode: ApproxCountMode, abortContext?: EsAbortContext): Promise<AdaptResult | null> => {
  const words = String(query.q ?? '').trim().split(/\s+/).slice(0, 8)
  if (words.length < 2) return null // nothing to relax on a single word

  // the full OR query (all other filters included) — the preflight measures within that context
  const orQuery = prepareQuery(dataset, { ...query, q_mode: 'simple', q_required: undefined }).query
  const randSlice = { range: { _rand: { lt: mode.randBound } } }
  const wordClause = (word: string) => buildQClauses(dataset, word, undefined, 'simple')

  const preflight = await esSearch(client, dataset, {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [orQuery, randSlice] } },
    aggs: { perWord: { filters: { filters: Object.fromEntries(words.map(w => [w, wordClause(w)])) } } }
  }, abortContext)
  const sampledOr = preflight.hits.total.value

  // under the cap the request must run exactly as today (exact total, full OR semantics)
  if (sampledOr < mode.cap * mode.probability) return null

  const floorSample = Math.ceil(mode.cap * mode.probability * config.elasticsearch.approxCount.adaptFloorSafety)
  const sampledByWord: Record<string, number> = {}
  for (const word of words) sampledByWord[word] = preflight.aggregations.perWord.buckets[word].doc_count
  const byRarity = [...words].sort((a, b) => sampledByWord[a] - sampledByWord[b])

  // rungs strictest-first: require the j rarest words. j=1 counts are exact from the agg;
  // multi-word rungs are conjunctions — count only those whose upper bound (min of member
  // counts) clears the floor, all in one _msearch.
  const rungs: Array<{ required: string[], ignored: string[], sampled: number }> = []
  const toCount: Array<{ index: number, required: string[] }> = []
  for (let j = words.length; j >= 1; j--) {
    const required = byRarity.slice(0, j)
    const ignored = byRarity.slice(j)
    if (j === 1) {
      rungs.push({ required, ignored, sampled: sampledByWord[required[0]] })
    } else {
      const upperBound = Math.min(...required.map(w => sampledByWord[w]))
      rungs.push({ required, ignored, sampled: 0 })
      if (upperBound >= floorSample) toCount.push({ index: rungs.length - 1, required })
    }
  }
  rungs.push({ required: [], ignored: [], sampled: sampledOr }) // loosest rung: unrestricted

  if (toCount.length) {
    const msearchBody = toCount.flatMap(({ required }) => [
      {},
      {
        size: 0,
        track_total_hits: true,
        query: { bool: { filter: [orQuery, ...required.map(wordClause), randSlice] } }
      }
    ])
    // no `timeout` querystring: _msearch rejects it (the per-request timedEsCall wall-clock
    // backstop still bounds the whole preflight)
    const res = await timedEsCall(abortContext, () => client.transport.request({
      method: 'POST',
      path: `/${aliasName(dataset)}/_msearch`,
      bulkBody: msearchBody
    }, { ...abortContext, meta: true }))
    const responses: any[] = ((res as any).body).responses
    for (const [i, { index }] of toCount.entries()) {
      if (responses[i].error) throw httpError(500, '[internal] adapt preflight msearch failed: ' + JSON.stringify(responses[i].error).slice(0, 200))
      rungs[index].sampled = responses[i].hits.total.value
    }
  }

  const chosen = decideAdaptiveRung(rungs, floorSample)
  return {
    required: chosen.required,
    ignored: chosen.ignored,
    total: extrapolateApproxTotal(chosen.sampled, mode),
    totalRelation: 'estimate'
  }
}
