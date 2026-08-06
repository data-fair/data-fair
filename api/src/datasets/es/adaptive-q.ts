import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { aliasName, prepareQuery } from './commons.ts'
import { esSearchBody } from './approx-count.ts'
import { type ApproxCountMode, extrapolateApproxTotal, estimateMarginPct, chooseStrictestCandidate, buildOrAdaptCandidates, type OrAdaptCandidate, buildQClauses, ADAPT_FLOOR_SAFETY, ADAPT_MIN_BITE } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'
import { type EsAbortContext, timedEsCall } from './abort.ts'

// q_mode=adapt: ignore the most frequent words of the search in filtering — just enough of
// them that the RETAINED-WORD UNION stays above the exactness horizon (the track_total_hits
// cap) — while every word keeps scoring (see buildQClauses' score-broad-match-strict shape).
// The match set is the plain OR search minus the docs that only matched ignored words.
//
// The decision is measured on the `_rand < randBound` sample slice, so every count in this
// module is in SAMPLED DOCS (multiply by 1/probability for real counts). One size:0 search
// returns the sampled count of the full OR search plus a per-word sampled count (filters
// agg); union-size bounds decide most candidates from those alone (buildOrAdaptCandidates),
// and the few undecided unions are counted in one _msearch. All probe requests are size:0
// and deterministic → shard-request-cacheable.
//
// Outcomes (THE INVARIANT: searches totalling under the cap run exactly as today):
//   - OR search under the cap                → null (plain behaviour, exact total)
//   - some words can be ignored              → { ignored: the most frequent }
//   - nothing ignorable above the floor, or
//     ignoring would not bite (co-occurring
//     words: the union ≈ the full OR)        → { ignored: [] } (plain capped OR, sampled total)
// The chosen candidate's sampled count also provides the response total, so the /lines
// pipeline needs no separate count leg. Design evidence: benchmark/INVESTIGATIONS.md §14.

export interface AdaptResult {
  ignored: string[]
  total: number
  /** margin of error in percent (~95 % confidence, rounded up) — becomes meta.totalMarginPct */
  marginPct: number
}

// simple_query_string operators: a q using them is an expert query speaking sqs, not plain
// words — adapt steps aside entirely (plain cap + sampled estimate apply) rather than risk
// ignoring a word the user explicitly required (+), negated (-), quoted or grouped.
const SQS_SYNTAX = /[+\-|"*()~\\]/

// Hard structural bound on the preflight fan-out: only the first MAX_ADAPT_WORDS distinct
// words are considered, so an adapt request costs AT MOST 3 ES round trips whatever the
// query — the filters-agg probe (≤ MAX_ADAPT_WORDS buckets), one _msearch of
// ≤ MAX_ADAPT_WORDS-1 union counts, and the main search. Words beyond the bound can never
// be ignored — they always stay retained, the safe (looser) direction.
const MAX_ADAPT_WORDS = 8

export const runAdaptivePreflight = async (client: Client, dataset: any, query: Record<string, any>, mode: ApproxCountMode, abortContext?: EsAbortContext): Promise<AdaptResult | null> => {
  const q = String(query.q ?? '').trim()
  if (SQS_SYNTAX.test(q)) return null
  const words = [...new Set(q.split(/\s+/))].slice(0, MAX_ADAPT_WORDS)
  if (words.length < 2) return null // nothing to relax on a single word

  // the full OR query (all other filters included) — the probes measure within that context
  const orQuery = prepareQuery(dataset, { ...query, q_mode: 'simple', q_ignored: undefined }).query
  const sampleSlice = { range: { _rand: { lt: mode.randBound } } }
  // the per-word probes deliberately omit `exactMatch` (the new-shape exact-boost clause), and that
  // cannot skew them: `orQuery` above already carries the clause on stamped datasets, the clause is
  // scoring-only inside a bool whose match set is pinned by the unboosted `filter` legs, and on a
  // keyword_repeat index its terms are a subset of the plain clause's anyway (originals imply their
  // stems; stopwords have no postings at all). Probes count docs, never score them.
  const wordMatchClauses: Record<string, any> = Object.fromEntries(words.map(word => [word, buildQClauses(dataset, word, undefined, 'simple')]))

  const probe = await esSearchBody(client, dataset, {
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

  // candidates strictest-first: ignore the k most frequent words, keep the rest as an OR
  // filter. Union-size bounds fill most sampled counts without ES (see the helper's doc);
  // the undecided unions are counted in one _msearch. Two probes with two mechanisms on
  // purpose: the candidates depend on the frequency order (unknown before the agg answers),
  // and each shape matches its execution model — a filters agg amortizes the unconditional
  // per-word counts over ONE scan of the slice, while a retained-OR union as a top-level
  // filtered query iterates only its own posting lists.
  const candidates = buildOrAdaptCandidates(words, wordSampledCount, orSampledCount, floorSample)
  const needCounting = candidates.filter(candidate => candidate.sampledCount === null)

  if (needCounting.length) {
    const msearchBody = needCounting.flatMap(candidate => [
      {},
      {
        size: 0,
        track_total_hits: true,
        // _msearch rejects a `timeout` querystring but accepts it per body — same ES-side
        // bound as every other search (the client requestTimeout stays the backstop)
        timeout: config.elasticsearch.searchTimeout,
        query: {
          bool: {
            filter: [
              orQuery,
              { bool: { should: candidate.retained.map(word => wordMatchClauses[word]), minimum_should_match: 1 } },
              sampleSlice
            ]
          }
        }
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

  const chosen = chooseStrictestCandidate(candidates as Array<OrAdaptCandidate & { sampledCount: number }>, floorSample)

  // an ignore-set must actually bite: when the query's words co-occur (phrase-like
  // searches), the retained union covers (almost) the whole OR sample — filtering would
  // exclude (almost) nothing and reporting "ignored" words would be pure noise. The two
  // counts are nested on the same sample slice, so this comparison is exact, not
  // statistical; and the union grows along looseness, so if the strictest candidate does
  // not bite, no candidate does.
  if (chosen.ignored.length && chosen.sampledCount >= orSampledCount * ADAPT_MIN_BITE) {
    return {
      ignored: [],
      total: extrapolateApproxTotal(orSampledCount, mode),
      marginPct: estimateMarginPct(orSampledCount)
    }
  }
  return {
    ignored: chosen.ignored,
    total: extrapolateApproxTotal(chosen.sampledCount, mode),
    marginPct: estimateMarginPct(chosen.sampledCount)
  }
}
