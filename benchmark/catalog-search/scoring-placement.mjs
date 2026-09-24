// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// WHERE should rung 4's BM25F scoring run? The quality tables say every IDF-bearing option lands
// within a few points of the others, so this is an operational question, not a quality one.
//
//   node benchmark/catalog-search/scale-fixtures.mjs [url]     # prerequisite: builds ss_* collections
//   node benchmark/catalog-search/scoring-placement.mjs [url]
//
// Three metrics, because they answer different questions and disagree:
//   wall          what the user waits for
//   process CPU   what the API pod costs — the scarce resource on a busy server; the throughput bill
//   block         the longest CONTIGUOUS synchronous main-thread block — the latency blast radius,
//                 i.e. how long every other request is frozen out
//
// Three placements:
//   B  node scores (the shipped shape): driver materialises every candidate, node scores them
//   D  mongo scores in the aggregation: node only ever receives the page
//   E  worker thread over raw BSON: decode+score off-thread, zero-copy transfer. This is the
//      ARCHITECTURAL TWIN of a Rust napi module (raw bytes in, top-N ids out), so its numbers are
//      the ceiling of the Rust option — and its residual stall is the part Rust cannot remove
//      either, since that stall is the driver materialising Buffers upstream of the boundary.
//
// On measuring the block: an earlier version of this script sampled a 1ms timer to infer stalls.
// That instrument disagreed with itself by ~5x across runs, because a sampler cannot observe a
// stall it is still inside and what it does catch mixes in driver batches and GC pauses. The
// scoring pass is SYNCHRONOUS, so its duration IS the block — it is timed directly here, which is
// exact and reproduces to within a couple of milliseconds.
//
// Note that block and process CPU are different quantities and must not be conflated: at 200k the
// node-scoring variant burns ~186ms of CPU but blocks for only ~20ms, because the driver
// deserialises incrementally and yields between batches. The CPU is the throughput cost; the block
// is the latency cost.

import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import path from 'node:path'
import { tokenizeStem, FIELD_WEIGHTS, K1, B, median } from './stem.mjs'

const require_ = createRequire(path.join(process.cwd(), 'package.json'))
const { MongoClient } = await import('mongodb').catch(() => require_('mongodb'))
const { BSON } = await import('bson').catch(() => require_('bson'))

const url = process.argv[2] ?? 'mongodb://localhost:27017/catalog-search-bench'
const client = await MongoClient.connect(url)
const db = client.db()
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }

const worker = new Worker(new URL('./worker-score-impl.mjs', import.meta.url))
const askWorker = (msg, transfer) => new Promise(resolve => { worker.once('message', resolve); worker.postMessage(msg, transfer) })

const QUERY = 'consommation electrique annuelle par commune'

/** Everything a placement needs for one collection at one gate size. */
const prepare = async (coll, N, gateSize) => {
  const queryTerms = [...new Set(tokenizeStem(QUERY))]
  const dfs = {}
  for (const t of queryTerms) dfs[t] = await coll.countDocuments({ _terms: t })
  const rarest = queryTerms.slice().sort((a, b) => dfs[a] - dfs[b]).slice(0, gateSize)
  const idfs = queryTerms.map(t => Math.log(1 + (N - dfs[t] + 0.5) / (dfs[t] + 0.5)))
  const avgLen = {}
  for (const field of Object.keys(FIELD_WEIGHTS)) avgLen[field] = 40 // constant: affects scores, not timing
  const match = rarest.length === 1 ? { _terms: rarest[0] } : { _terms: { $in: rarest } }
  const proj = { slug: 1, _len: 1 }
  for (const field of Object.keys(FIELD_WEIGHTS)) for (const t of queryTerms) proj[`_tf.${field}.${t}`] = 1
  const score = (d) => {
    let s = 0
    for (let k = 0; k < queryTerms.length; k++) {
      const t = queryTerms[k]; const iv = idfs[k]
      for (const field in FIELD_WEIGHTS) {
        const tf = d._tf?.[field]?.[t]
        if (!tf) continue
        s += FIELD_WEIGHTS[field] * iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d._len?.[field] ?? 0) / avgLen[field]))
      }
    }
    return s
  }
  const adds = []
  for (let k = 0; k < queryTerms.length; k++) {
    const t = queryTerms[k]; const iv = idfs[k]
    for (const field in FIELD_WEIGHTS) {
      adds.push({
        $let: {
          vars: { tf: { $ifNull: [`$_tf.${field}.${t}`, 0] }, l: { $ifNull: [`$_len.${field}`, 0] } },
          in: {
            $cond: [{ $eq: ['$$tf', 0] }, 0, {
              $multiply: [FIELD_WEIGHTS[field] * iv, {
                $divide: [{ $multiply: ['$$tf', K1 + 1] },
                  { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / avgLen[field], '$$l'] }] }] }] }]
              }]
            }]
          }
        }
      })
    }
  }
  return { queryTerms, idfs, avgLen, match, proj, score, adds }
}

// each runner returns { candidates, block } — block being its longest synchronous main-thread run
const runB = async (coll, p) => {
  const docs = await coll.find(p.match).project(p.proj).toArray()
  const t0 = performance.now() // the scoring pass is synchronous: nothing async until it ends
  docs.map(d => ({ slug: d.slug, s: p.score(d) })).sort((a, b) => b.s - a.s).slice(0, 20)
  return { candidates: docs.length, block: performance.now() - t0 }
}
const runD = async (coll, p) => {
  const docs = await coll.aggregate([
    { $match: p.match },
    { $addFields: { _score: { $add: p.adds } } },
    { $sort: { _score: -1 } }, { $limit: 20 }, { $project: { slug: 1, _score: 1 } }
  ], { allowDiskUse: true }).toArray()
  return { candidates: docs.length, block: 0 } // node scores nothing; it receives the page
}
const runE = async (coll, p) => {
  const bufs = []; let total = 0
  for await (const b of coll.find(p.match, { raw: true }).project(p.proj)) { bufs.push(b); total += b.length }
  const t0 = performance.now() // main thread only packs the arena; decode+score happen off-thread
  const arena = new ArrayBuffer(total)
  const view = Buffer.from(arena)
  const offsets = new Uint32Array(bufs.length + 1)
  let off = 0
  for (let i = 0; i < bufs.length; i++) { bufs[i].copy(view, off); offsets[i] = off; off += bufs[i].length }
  offsets[bufs.length] = off
  const block = performance.now() - t0
  await askWorker({ arena, offsets, queryTerms: p.queryTerms, idfs: p.idfs, weights: FIELD_WEIGHTS, avgLen: p.avgLen }, [arena])
  return { candidates: bufs.length, block }
}

const timed = async (fn) => {
  const c0 = cpuMs(); const t0 = performance.now()
  const extra = await fn()
  return { wall: performance.now() - t0, cpu: cpuMs() - c0, block: extra?.block ?? 0, extra }
}
const agg = (rows) => ({ wall: median(rows.map(r => r.wall)), cpu: median(rows.map(r => r.cpu)), block: median(rows.map(r => r.block)) })
const repeat = async (n, fn) => { const out = []; for (let i = 0; i < n; i++) out.push(await timed(fn)); return out }

// ---------------------------------------------------------------- 1. where does the node CPU go?
console.log('## 1. What the node-side cost actually IS (200k docs, rarest-term gate)\n')
{
  const coll = db.collection('ss_200000')
  const p = await prepare(coll, 200000, 1)
  let bytes = 0; let count = 0
  const raw = await repeat(3, async () => {
    let tot = 0; let k = 0
    for await (const b of coll.find(p.match, { raw: true }).project(p.proj)) { tot += b.length; k++ }
    bytes = tot; count = k
    return { candidates: k, block: 0 }
  })
  const decoded = await repeat(3, async () => {
    const docs = []
    for await (const b of coll.find(p.match, { raw: true }).project(p.proj)) docs.push(BSON.deserialize(b))
    docs.map(d => ({ slug: d.slug, s: p.score(d) })).sort((a, b) => b.s - a.s).slice(0, 20)
    return { candidates: docs.length, block: 0 }
  })
  const a1 = agg(raw); const a2 = agg(decoded)
  console.log(`candidates ${count}, raw BSON ${(bytes / 1048576).toFixed(1)} MB (${Math.round(bytes / count)} B/doc)\n`)
  console.log('| stage | wall | node CPU |')
  console.log('|---|---|---|')
  console.log(`| raw buffers, never decoded (driver + socket floor) | ${a1.wall.toFixed(0)} ms | ${a1.cpu.toFixed(0)} ms |`)
  console.log(`| + BSON -> V8 materialisation + BM25F scoring | ${a2.wall.toFixed(0)} ms | ${a2.cpu.toFixed(0)} ms |`)
  console.log('\nThe floor is unavoidable. Of the rest, materialisation dominates the arithmetic —\nwhich is why "make the maths faster" (Rust, SIMD) addresses the smaller half.')
}

// ---------------------------------------------------------------- 2. placements across scale
console.log('\n## 2. Placement across scale (rarest-term gate — fast but UNSAFE, see retrieval-safety.mjs)\n')
console.log('| docs | placement | wall | process CPU | main-thread block |')
console.log('|---|---|---|---|---|')
for (const N of [10000, 50000, 200000]) {
  const coll = db.collection(`ss_${N}`)
  if (!await coll.estimatedDocumentCount()) { console.log(`| ${N} | (collection missing — run scale-fixtures.mjs) | | | |`); continue }
  const p = await prepare(coll, N, 1)
  const rows = { 'B  node scores (shipped shape)': await repeat(5, () => runB(coll, p)), 'D  mongo aggregation scores': await repeat(5, () => runD(coll, p)), 'E  worker thread over raw BSON': await repeat(5, () => runE(coll, p)) }
  for (const [label, rs] of Object.entries(rows)) { const a = agg(rs); console.log(`| ${N} | ${label} | ${a.wall.toFixed(0)} ms | ${a.cpu.toFixed(0)} ms | ${a.block.toFixed(0)} ms |`) }
}
console.log(`
NOTE: process CPU counts ALL threads, so E's figure includes its worker; E's main-thread cost is
the block column. B burns far more CPU than it blocks for, because the driver deserialises
incrementally and yields between batches — CPU is the throughput bill, block is the latency one.`)

// ---------------------------------------------------------------- 3. the safe gate changes the bill
console.log('\n## 3. Under a SAFE gate (rarest K, K>=2) the candidate set roughly doubles\n')
console.log('| docs | gate | candidates | B wall / CPU / block | D wall / CPU / block |')
console.log('|---|---|---|---|---|')
for (const N of [50000, 200000]) {
  const coll = db.collection(`ss_${N}`)
  if (!await coll.estimatedDocumentCount()) continue
  const nTerms = [...new Set(tokenizeStem(QUERY))].length
  for (const K of [1, 2, 3, nTerms]) {
    const p = await prepare(coll, N, K)
    const b = await repeat(3, () => runB(coll, p))
    const d = await repeat(3, () => runD(coll, p))
    const ab = agg(b); const ad = agg(d)
    const label = K === 1 ? 'rarest 1 (UNSAFE)' : K === nTerms ? `all ${K} (OR)` : `rarest ${K}`
    console.log(`| ${N} | ${label} | ${b[0].extra.candidates} | ${ab.wall.toFixed(0)} / ${ab.cpu.toFixed(0)} / ${ab.block.toFixed(0)} ms | ${ad.wall.toFixed(0)} / ${ad.cpu.toFixed(0)} / ${ad.block.toFixed(0)} ms |`)
  }
}
console.log(`
CONCLUSION: D's node CPU is essentially INDEPENDENT of the candidate count, because node only ever
receives the page. Widening the gate for safety roughly doubles B's bill and leaves D's untouched.
D trades ~1.5-2x wall time for ~20-40x less API-process CPU, at every scale and every gate size.`)
await worker.terminate()
await client.close()
