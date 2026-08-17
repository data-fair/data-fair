// Real-corpus (RNA) evaluation of the OR-of-retained redesign of q_mode=adapt vs the
// shipped AND-of-required implementation (see INVESTIGATIONS.md §12-C / §13).
//
// Variants, all sharing the "score broad, match strict" shape (scores stay pure OR BM25):
//   or-exact          today with count=exact — the fidelity baseline (top-20 reference)
//   or-capped         plain capped OR — what adapt falls back to when it steps aside
//   shipped-and       the merged design: require the rarest-prefix conjunction that keeps
//                     the set above the cap floor (filters-agg probe + conjunction _msearch)
//   or-capfloor       proposed: filter = OR of retained words; ignore the most frequent
//                     words, as many as possible while the retained UNION stays above the
//                     cap floor (probe: same filters agg; union counts only when the
//                     max/sum solo bounds cannot decide)
//   or-noise2pct      proposed: ignore words whose solo match count > 2 % of the corpus
//                     (the §12-C rare-must threshold), keep the rest as an OR filter; the
//                     retained union MAY fall below the cap → exact total (honest small page)
//   or-noisecap       same, threshold = solo estimate > cap (10k) — expected to degenerate
//                     on a 3.3M corpus (0.3 %): included as evidence for the threshold choice
//
// Metrics per variant: end-to-end ES cost (sum of `took` across probe legs + main query,
// request cache cleared before every measured run — §13 methodology), top-20 overlap vs
// or-exact, the ignore/require decision, and the display total.
// Sampling matches shipped config on this corpus: p=0.01 (_rand < 10000), cap=10000,
// ADAPT_FLOOR_SAFETY=1.2 → floorSample=120.
// Usage: node --experimental-strip-types src/rna-adapt-or.ts --node=http://localhost:16395 [--index=bench-rna] [--runs=10] [--cold]

import { parseArgs } from 'node:util'
import { aggregate } from './metrics.ts'

const { values } = parseArgs({
  options: {
    node: { type: 'string', default: 'http://localhost:16395' },
    index: { type: 'string', default: 'bench-rna' },
    runs: { type: 'string', default: '10' },
    warmup: { type: 'string', default: '2' },
    cold: { type: 'boolean', default: false }
  }
})
const runs = parseInt(values.runs!)
const warmup = parseInt(values.warmup!)

const FIELDS = ['_search', '_search.text_standard']
const SEARCH_FIELDS = ['_search']
const STANDARD_FIELDS = ['_search.text_standard']

// shipped config on a 3.29M-row corpus: p = clamp(sampleTarget/count) = 0.01
const CAP = 10000
const P = 0.01
const RAND_BOUND = 10000 // p × 1e6
const FLOOR_SAFETY = 1.2
const sampledCap = CAP * P // 100
const floorSample = Math.ceil(sampledCap * FLOOR_SAFETY) // 120
const NOISE_2PCT = 0.02

const QUERIES = [
  'rue baudelaire',
  'association sportive',
  'club de football marseille',
  'comité des fêtes saint pierre',
  'les amis de la bibliothèque', // new: stopword-laden French, the pathological prod shape
  'association'
]

async function es (method: string, path: string, body?: any, ndjson?: string): Promise<any> {
  const res = await fetch(values.node! + path, {
    method,
    headers: { 'Content-Type': ndjson !== undefined ? 'application/x-ndjson' : 'application/json' },
    body: ndjson !== undefined ? ndjson : (body === undefined ? undefined : JSON.stringify(body))
  })
  const data: any = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data.error?.root_cause?.[0] ?? data).slice(0, 200)}`)
  return data
}

const sqs = (q: string, fields: string[]) => ({
  simple_query_string: { query: q, fields, default_operator: 'or' }
})
// buildQClauses 'simple' shape: match on stemmed and raw inner fields
const scoredClause = (q: string) => ({
  bool: { should: [sqs(q, SEARCH_FIELDS), sqs(q, STANDARD_FIELDS)], minimum_should_match: 1 }
})
// the per-word clause used both by the probe agg and the main-query filters
const wordClause = (w: string) => ({ multi_match: { query: w, fields: FIELDS } })

const orFilter = (retained: string[]) => ({
  bool: { should: retained.map(wordClause), minimum_should_match: 1 }
})
const sampleSlice = { range: { _rand: { lt: RAND_BOUND } } }

interface Legs { probe1: number, probe2: number, main: number }
interface RunResult {
  legs: Legs
  total: string
  top: string[]
  note: string
}

const fmtEst = (sampled: number) => '~' + Math.round(sampled / P).toLocaleString() + ' (est)'

async function clearRequestCache () {
  await es('POST', `/${values.index}/_cache/clear?request=true`)
}
async function clearAllCaches () {
  await es('POST', `/${values.index}/_cache/clear`)
}

/** One measured execution of a variant; returns cost legs + page + decision note. */
type Variant = () => Promise<RunResult>

async function measure (name: string, variant: Variant): Promise<RunResult & { p50: number, min: number }> {
  for (let w = 0; w < warmup; w++) await variant()
  const costs: number[] = []
  let last: RunResult
  for (let r = 0; r < runs; r++) {
    if (values.cold) await clearAllCaches()
    else await clearRequestCache()
    last = await variant()
    costs.push(last.legs.probe1 + last.legs.probe2 + last.legs.main)
  }
  const agg = aggregate(costs)
  return { ...last!, p50: agg.median, min: agg.min }
}

/** probe1, shared by all adapt variants: sampled OR total + per-word sampled counts. */
async function probe1 (q: string, words: string[]) {
  const res = await es('POST', `/${values.index}/_search`, {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [scoredClause(q), sampleSlice] } },
    aggs: { perWord: { filters: { filters: Object.fromEntries(words.map(w => [w, wordClause(w)])) } } }
  })
  const solo: Record<string, number> = {}
  for (const w of words) solo[w] = res.aggregations.perWord.buckets[w].doc_count
  return { took: res.took as number, orSampled: res.hits.total.value as number, solo }
}

async function msearchCounts (q: string, filtersPerBody: any[][]): Promise<{ took: number, counts: number[] }> {
  const body = filtersPerBody.flatMap(filters => [
    {},
    { size: 0, track_total_hits: true, query: { bool: { filter: [scoredClause(q), ...filters, sampleSlice] } } }
  ])
  const res = await es('POST', `/${values.index}/_msearch`, undefined, body.map(b => JSON.stringify(b)).join('\n') + '\n')
  let took = 0
  const counts: number[] = []
  for (const r of res.responses) {
    if (r.error) throw new Error('msearch: ' + JSON.stringify(r.error).slice(0, 200))
    took += r.took
    counts.push(r.hits.total.value)
  }
  return { took, counts }
}

async function mainSearch (q: string, filter: any[], trackTotal: number | boolean = CAP) {
  const res = await es('POST', `/${values.index}/_search`, {
    size: 20,
    track_total_hits: trackTotal,
    query: { bool: { must: [scoredClause(q)], filter } }
  })
  return { took: res.took as number, top: res.hits.hits.map((h: any) => h._id) as string[], total: res.hits.total }
}

// ---- the variants ----

const orExact = (q: string): Variant => async () => {
  const main = await mainSearch(q, [], true)
  return { legs: { probe1: 0, probe2: 0, main: main.took }, total: `${main.total.value.toLocaleString()} (eq)`, top: main.top, note: '' }
}

const orCapped = (q: string): Variant => async () => {
  const main = await mainSearch(q, [])
  return { legs: { probe1: 0, probe2: 0, main: main.took }, total: `${main.total.value.toLocaleString()} (${main.total.relation})`, top: main.top, note: '' }
}

/** The merged implementation: rarest-prefix conjunctions, strictest above the floor. */
const shippedAnd = (q: string, words: string[]): Variant => async () => {
  const p1 = await probe1(q, words)
  if (p1.orSampled < sampledCap) {
    const main = await mainSearch(q, [], true)
    return { legs: { probe1: p1.took, probe2: 0, main: main.took }, total: `${main.total.value.toLocaleString()} (eq)`, top: main.top, note: 'under cap → plain' }
  }
  const byRarity = [...words].sort((a, b) => p1.solo[a] - p1.solo[b])
  interface Cand { required: string[], ignored: string[], sampledCount: number }
  const candidates: Cand[] = []
  const needCounting: Cand[] = []
  for (let n = words.length; n >= 1; n--) {
    const cand: Cand = { required: byRarity.slice(0, n), ignored: byRarity.slice(n), sampledCount: 0 }
    candidates.push(cand)
    if (n === 1) cand.sampledCount = p1.solo[cand.required[0]]
    else if (Math.min(...cand.required.map(w => p1.solo[w])) >= floorSample) needCounting.push(cand)
  }
  candidates.push({ required: [], ignored: [], sampledCount: p1.orSampled })
  let probe2Took = 0
  if (needCounting.length) {
    const { took, counts } = await msearchCounts(q, needCounting.map(c => c.required.map(wordClause)))
    probe2Took = took
    needCounting.forEach((c, i) => { c.sampledCount = counts[i] })
  }
  const chosen = candidates.find(c => c.sampledCount >= floorSample) ?? candidates[candidates.length - 1]
  const main = await mainSearch(q, chosen.required.map(wordClause))
  return {
    legs: { probe1: p1.took, probe2: probe2Took, main: main.took },
    total: fmtEst(chosen.sampledCount),
    top: main.top,
    note: chosen.required.length ? `require=[${chosen.required.join(',')}] ignore=[${chosen.ignored.join(',')}]` : 'unrestricted'
  }
}

/** Proposed: OR of retained words, ignore as many frequent words as the cap floor allows.
 *  Union counts requested only when the max/sum solo bounds cannot decide. */
const orCapfloor = (q: string, words: string[]): Variant => async () => {
  const p1 = await probe1(q, words)
  if (p1.orSampled < sampledCap) {
    const main = await mainSearch(q, [], true)
    return { legs: { probe1: p1.took, probe2: 0, main: main.took }, total: `${main.total.value.toLocaleString()} (eq)`, top: main.top, note: 'under cap → plain' }
  }
  const byFreq = [...words].sort((a, b) => p1.solo[b] - p1.solo[a]) // most frequent first
  interface Cand { retained: string[], ignored: string[], union: number | null }
  // strictest first: ignore the k most frequent words, k = n-1 … 0
  const candidates: Cand[] = []
  for (let k = words.length - 1; k >= 0; k--) {
    candidates.push({ ignored: byFreq.slice(0, k), retained: byFreq.slice(k), union: null })
  }
  // bounds: union ≥ max(solo), union ≤ sum(solo); count only the undecided + the chosen
  const toCount: Cand[] = []
  for (const cand of candidates) {
    const max = Math.max(...cand.retained.map(w => p1.solo[w]))
    const sum = cand.retained.reduce((a, w) => a + p1.solo[w], 0)
    if (cand.retained.length === 1) {
      cand.union = p1.solo[cand.retained[0]]
      if (cand.union >= floorSample) break // strictest qualifies with a known total: done
    } else if (sum < floorSample) {
      cand.union = sum // disqualified, upper bound is enough
    } else if (max >= floorSample) {
      toCount.push(cand) // qualified: count for the total, then stop
      break
    } else {
      toCount.push(cand) // undecided
    }
  }
  let probe2Took = 0
  if (toCount.length) {
    const { took, counts } = await msearchCounts(q, toCount.map(c => [orFilter(c.retained)]))
    probe2Took = took
    toCount.forEach((c, i) => { c.union = counts[i] })
  }
  const chosen = candidates.find(c => (c.union ?? 0) >= floorSample) ?? candidates[candidates.length - 1]
  const filter = chosen.ignored.length ? [orFilter(chosen.retained)] : []
  const main = await mainSearch(q, filter)
  return {
    legs: { probe1: p1.took, probe2: probe2Took, main: main.took },
    total: fmtEst(chosen.union ?? p1.orSampled),
    top: main.top,
    note: chosen.ignored.length ? `ignore=[${chosen.ignored.join(',')}] retain=[${chosen.retained.join(',')}]` : 'nothing ignorable'
  }
}

/** Proposed: noise-threshold rule — ignore words whose solo count exceeds `pct` of the
 *  corpus; the retained union may fall below the cap (exact total then). */
const orNoise = (q: string, words: string[], pct: number, corpus: number): Variant => async () => {
  const p1 = await probe1(q, words)
  if (p1.orSampled < sampledCap) {
    const main = await mainSearch(q, [], true)
    return { legs: { probe1: p1.took, probe2: 0, main: main.took }, total: `${main.total.value.toLocaleString()} (eq)`, top: main.top, note: 'under cap → plain' }
  }
  const noiseSampled = corpus * pct * P
  const ignored = words.filter(w => p1.solo[w] > noiseSampled)
  const retained = words.filter(w => p1.solo[w] <= noiseSampled)
  if (!ignored.length || !retained.length) {
    const main = await mainSearch(q, [])
    const why = retained.length ? 'no noise word' : 'all words are noise'
    return { legs: { probe1: p1.took, probe2: 0, main: main.took }, total: fmtEst(p1.orSampled), top: main.top, note: `${why} → plain capped` }
  }
  let probe2Took = 0
  let unionSampled: number
  if (retained.length === 1) {
    unionSampled = p1.solo[retained[0]]
  } else {
    const { took, counts } = await msearchCounts(q, [[orFilter(retained)]])
    probe2Took = took
    unionSampled = counts[0]
  }
  // below the floor the estimate is unreliable AND the set is selective → exact main query
  const belowCap = unionSampled < floorSample
  const main = await mainSearch(q, [orFilter(retained)], belowCap ? true : CAP)
  return {
    legs: { probe1: p1.took, probe2: probe2Took, main: main.took },
    total: belowCap ? `${main.total.value.toLocaleString()} (eq)` : fmtEst(unionSampled),
    top: main.top,
    note: `ignore=[${ignored.join(',')}] retain=[${retained.join(',')}]${belowCap ? ' BELOW CAP' : ''}`
  }
}

// ---- run ----

const info = await es('GET', '/')
const countRes = await es('GET', `/${values.index}/_count`)
const corpus = countRes.count
console.log(`\nES ${info.version.number} @ ${values.node} — ${values.index} (${corpus.toLocaleString()} docs), runs=${runs}, ${values.cold ? 'cold' : 'warm (request cache cleared)'}\n` +
  `cap=${CAP} p=${P} floorSample=${floorSample} noise2pct=${Math.round(corpus * NOISE_2PCT).toLocaleString()} docs`)

for (const q of QUERIES) {
  const words = q.split(/\s+/)
  console.log(`\n=== q="${q}"`)
  const rows: Array<[string, RunResult & { p50: number, min: number }]> = []
  rows.push(['or-exact (base)', await measure('or-exact', orExact(q))])
  rows.push(['or-capped', await measure('or-capped', orCapped(q))])
  if (words.length > 1) {
    rows.push(['shipped-and', await measure('shipped-and', shippedAnd(q, words))])
    rows.push(['or-capfloor', await measure('or-capfloor', orCapfloor(q, words))])
    rows.push(['or-noise2pct', await measure('or-noise2pct', orNoise(q, words, NOISE_2PCT, corpus))])
    rows.push(['or-noisecap', await measure('or-noisecap', orNoise(q, words, CAP / corpus, corpus))])
  }
  const baseTop = rows[0][1].top
  console.log('variant'.padEnd(17) + '| e2e p50 | legs p1+p2+main | total            | top20 | note')
  for (const [name, m] of rows) {
    const overlap = `${m.top.filter(id => baseTop.includes(id)).length}/${baseTop.length}`
    console.log(name.padEnd(17) +
      `| ${String(m.p50).padStart(7)} | ${String(m.legs.probe1).padStart(4)}+${String(m.legs.probe2).padStart(3)}+${String(m.legs.main).padStart(4)}    | ${m.total.padEnd(16)} | ${overlap.padStart(5)} | ${m.note}`)
  }
}
