import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.ts'
import { tooLongError, type ApproxCountMode, extrapolateApproxTotal, estimateMarginPct, chooseStrictestCandidate, buildQClauses, ADAPT_FLOOR_SAFETY } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'
import { type EsAbortContext, timedEsCall } from './abort.ts'

// q_mode=adapt: ignore the most frequent words of the search in filtering — just enough of
// them that the filtered set stays above the exactness horizon (the track_total_hits cap) —
// while every word keeps scoring (see buildQClauses' score-broad-match-strict shape).
//
// The decision is measured on the `_rand < randBound` sample slice, so every count in this
// module is in SAMPLED DOCS (multiply by 1/probability for real counts). One size:0 search
// returns the sampled count of the full OR search plus a per-word sampled count (filters
// agg); when several words might be required together, one _msearch counts those
// combinations. All probe requests are size:0 and deterministic → shard-request-cacheable.
//
// Outcomes (THE INVARIANT: searches totalling under the cap run exactly as today):
//   - OR search under the cap       → null (plain behaviour, exact total)
//   - all words can be required     → nothing ignored (ignored: [])
//   - some words must be ignored    → { required: the rarest, ignored: the most frequent }
//   - even one word is too narrow   → unrestricted (required: [], plain capped OR)
// The chosen candidate's sampled count also provides the response total, so the /lines
// pipeline needs no separate count leg.

export interface AdaptResult {
  required: string[]
  ignored: string[]
  total: number
  /** margin of error in percent (~95 % confidence, rounded up) — becomes meta.totalMarginPct */
  marginPct: number
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

// simple_query_string operators: a q using them is an expert query speaking sqs, not plain
// words — adapt steps aside entirely (plain cap + sampled estimate apply) rather than risk
// ignoring a word the user explicitly required (+), negated (-), quoted or grouped.
const SQS_SYNTAX = /[+\-|"*()~\\]/

// Hard structural bound on the preflight fan-out: only the first MAX_ADAPT_WORDS words are
// considered, so an adapt request costs AT MOST 3 ES round trips whatever the query — the
// filters-agg probe (≤ MAX_ADAPT_WORDS buckets), one _msearch of ≤ MAX_ADAPT_WORDS-1
// combination counts, and the main search.
const MAX_ADAPT_WORDS = 8

// A possible outcome: require the `required` words (a rarest-first prefix of the query's
// words), ignore the rest. `sampledCount` is the size of that filtered set on the sample slice.
interface Candidate {
  required: string[]
  ignored: string[]
  sampledCount: number
}

export const runAdaptivePreflight = async (client: Client, dataset: any, query: Record<string, any>, mode: ApproxCountMode, abortContext?: EsAbortContext): Promise<AdaptResult | null> => {
  const q = String(query.q ?? '').trim()
  if (SQS_SYNTAX.test(q)) return null
  const words = q.split(/\s+/).slice(0, MAX_ADAPT_WORDS)
  if (words.length < 2) return null // nothing to relax on a single word

  // the full OR query (all other filters included) — the probes measure within that context
  const orQuery = prepareQuery(dataset, { ...query, q_mode: 'simple', q_required: undefined }).query
  const sampleSlice = { range: { _rand: { lt: mode.randBound } } }
  const wordMatchClauses: Record<string, any> = Object.fromEntries(words.map(word => [word, buildQClauses(dataset, word, undefined, 'simple')]))

  const probe = await esSearch(client, dataset, {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [orQuery, sampleSlice] } },
    aggs: { perWord: { filters: { filters: wordMatchClauses } } }
  }, abortContext)
  const orSampledCount = probe.hits.total.value
  const wordSampledCount: Record<string, number> = {}
  for (const word of words) wordSampledCount[word] = probe.aggregations.perWord.buckets[word].doc_count

  // both thresholds in sampled-docs units: the cap itself, and the qualification floor
  // (cap plus a safety margin against sampling noise)
  const sampledCap = mode.cap * mode.probability
  const floorSample = Math.ceil(sampledCap * ADAPT_FLOOR_SAFETY)

  // under the cap the request must run exactly as today (exact total, full OR semantics)
  if (orSampledCount < sampledCap) return null

  // candidates strictest-first: require the `requiredCount` rarest words, ignore the rest.
  // A single required word is already counted by the agg; a multi-word combination can only
  // qualify if its rarest member does (its count bounds the conjunction), so only those are
  // worth counting — all in one _msearch.
  const wordsByRarity = [...words].sort((a, b) => wordSampledCount[a] - wordSampledCount[b])
  const candidates: Candidate[] = []
  const needCounting: Candidate[] = []
  for (let requiredCount = words.length; requiredCount >= 1; requiredCount--) {
    const candidate: Candidate = {
      required: wordsByRarity.slice(0, requiredCount),
      ignored: wordsByRarity.slice(requiredCount),
      sampledCount: 0
    }
    candidates.push(candidate)
    if (requiredCount === 1) {
      candidate.sampledCount = wordSampledCount[candidate.required[0]]
    } else if (Math.min(...candidate.required.map(word => wordSampledCount[word])) >= floorSample) {
      needCounting.push(candidate)
    }
  }
  candidates.push({ required: [], ignored: [], sampledCount: orSampledCount }) // loosest: unrestricted

  if (needCounting.length) {
    const msearchBody = needCounting.flatMap(candidate => [
      {},
      {
        size: 0,
        track_total_hits: true,
        // _msearch rejects a `timeout` querystring but accepts it per body — same ES-side
        // bound as every other search (the client requestTimeout stays the backstop)
        timeout: config.elasticsearch.searchTimeout,
        query: { bool: { filter: [orQuery, ...candidate.required.map(word => wordMatchClauses[word]), sampleSlice] } }
      }
    ])
    const res = await timedEsCall(abortContext, () => client.transport.request({
      method: 'POST',
      path: `/${aliasName(dataset)}/_msearch`,
      bulkBody: msearchBody
    }, { ...abortContext, meta: true }))
    const responses: any[] = ((res as any).body).responses
    for (const [i, candidate] of needCounting.entries()) {
      if (responses[i].error) throw httpError(500, '[internal] adapt preflight msearch failed: ' + JSON.stringify(responses[i].error).slice(0, 200))
      candidate.sampledCount = responses[i].hits.total.value
    }
  }

  const chosen = chooseStrictestCandidate(candidates, floorSample)
  return {
    required: chosen.required,
    ignored: chosen.ignored,
    total: extrapolateApproxTotal(chosen.sampledCount, mode),
    marginPct: estimateMarginPct(chosen.sampledCount)
  }
}
