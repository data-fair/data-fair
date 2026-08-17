import type { Client } from '@elastic/elasticsearch'
import { getEsClient } from './es.ts'
import { aggregate, type Aggregated } from './metrics.ts'

export interface QueryRunSample {
  took: number
  roundTripMs: number
  totalValue: number
  totalRelation: string
  hitsReturned: number
  bytes: number
  topHitIds: string[]
}

/** Pull the metrics we care about out of one ES _search response. When a sampling
 *  probability is known (a top-level `sample` random_sampler agg, or the variant's
 *  explicit samplerProbability for e.g. a `_rand` range filter), the sampled count
 *  extrapolated by 1/probability becomes the total, relation 'estimate'. */
export function extractSample (response: any, roundTripMs: number, bytes: number, samplerProbability?: number): QueryRunSample {
  const hits = response.hits
  let totalValue = hits.total?.value ?? 0
  let totalRelation = hits.total?.relation ?? 'eq'
  const sampledCount = response.aggregations?.sample?.doc_count ?? (samplerProbability ? hits.total?.value : undefined)
  if (samplerProbability && typeof sampledCount === 'number') {
    totalValue = Math.round(sampledCount / samplerProbability)
    totalRelation = 'estimate'
  }
  return {
    took: response.took,
    roundTripMs,
    totalValue,
    totalRelation,
    hitsReturned: hits.hits.length,
    bytes,
    topHitIds: hits.hits.map((h: any) => h._id)
  }
}

export interface ProfileSummary {
  totalTimeMs: number
  rewriteTimeMs: number
  topQueryTypes: { type: string, timeMs: number }[]
}

/** Collapse an ES _profile tree into a few headline numbers (top-level query nodes only). */
export function summarizeProfile (profile: any): ProfileSummary {
  let rewriteNanos = 0
  let queryNanos = 0
  const byType: Record<string, number> = {}
  for (const shard of profile?.shards ?? []) {
    for (const search of shard.searches ?? []) {
      rewriteNanos += search.rewrite_time ?? 0
      for (const node of search.query ?? []) {
        const nanos = node.time_in_nanos ?? 0
        queryNanos += nanos
        byType[node.type] = (byType[node.type] ?? 0) + nanos
      }
    }
  }
  const topQueryTypes = Object.entries(byType)
    .map(([type, nanos]) => ({ type, timeMs: nanos / 1e6 }))
    .sort((a, b) => b.timeMs - a.timeMs)
    .slice(0, 5)
  return { totalTimeMs: queryNanos / 1e6, rewriteTimeMs: rewriteNanos / 1e6, topQueryTypes }
}

export interface RunOptions {
  index: string
  body: Record<string, any>
  runs?: number
  warmup?: number
  cold?: boolean
  profile?: boolean
  /** Extrapolate hits.total (or the `sample` agg doc_count) by 1/probability — see extractSample. */
  samplerProbability?: number
}

export interface RunResult {
  index: string
  runs: number
  cold: boolean
  took: Aggregated
  roundTripMs: Aggregated
  bytes: Aggregated
  totalValue: number
  totalRelation: string
  topHitIds: string[]
  profile?: ProfileSummary
}

async function searchOnce (es: Client, index: string, body: Record<string, any>, samplerProbability?: number): Promise<QueryRunSample> {
  const t0 = performance.now()
  const res = await es.search({ index, ...body })
  const roundTripMs = performance.now() - t0
  const bytes = Buffer.byteLength(JSON.stringify(res))
  return extractSample(res, roundTripMs, bytes, samplerProbability ?? body.aggs?.sample?.random_sampler?.probability)
}

/** Run one ES query body N times serially and aggregate the per-query metrics. */
export async function runQuery (opts: RunOptions): Promise<RunResult> {
  const es = getEsClient()
  const { index, body } = opts
  const runs = opts.runs ?? 10
  const warmup = opts.warmup ?? 3
  const cold = opts.cold ?? false

  for (let w = 0; w < warmup; w++) await searchOnce(es, index, body, opts.samplerProbability)

  const samples: QueryRunSample[] = []
  for (let r = 0; r < runs; r++) {
    if (cold) await es.indices.clearCache({ index })
    samples.push(await searchOnce(es, index, body, opts.samplerProbability))
  }

  let profile: ProfileSummary | undefined
  if (opts.profile) {
    const res = await es.search({ index, ...body, profile: true })
    profile = summarizeProfile((res as any).profile)
  }

  const last = samples[samples.length - 1]
  return {
    index,
    runs,
    cold,
    took: aggregate(samples.map(s => s.took)),
    roundTripMs: aggregate(samples.map(s => s.roundTripMs)),
    bytes: aggregate(samples.map(s => s.bytes)),
    totalValue: last.totalValue,
    totalRelation: last.totalRelation,
    topHitIds: last.topHitIds,
    profile
  }
}
