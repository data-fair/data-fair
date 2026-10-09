// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Builds the synthetic rung-4 collections the scale benchmarks run against, and prints the first
// scale table. Real catalogs are only hundreds of datasets; these exist to answer "where does this
// break", including for OTHER entity types that could reuse the recipe at tens of thousands.
//
//   node benchmark/catalog-search/scale-fixtures.mjs [mongodb://localhost:27017/catalog-search-bench]
//
// Writes collections ss_10000, ss_50000, ss_200000, each a rung-4 index: _terms (multikey),
// _tf (per-field term counts), _len (per-field token counts). Documents are the real corpora
// repeated with a distinguishing token, so term diversity is LOW — candidate counts here are
// pessimistic, which is the right direction for a ceiling test.
//
// Inserts are streamed in batches; building 200k documents in one array exhausts the heap.

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { tokenizeStem, FIELD_WEIGHTS, K1, B, docFields, median } from './stem.mjs'

const { MongoClient } = await import('mongodb').catch(() => createRequire(path.join(process.cwd(), 'package.json'))('mongodb'))

const here = import.meta.dirname
const shadow = JSON.parse(await readFile(path.join(here, 'shadow.json'), 'utf8'))
const client = await MongoClient.connect(process.argv[2] ?? 'mongodb://localhost:27017/catalog-search-bench')
const db = client.db()

const base = []
for (const host of ['opendata.koumoul.com', 'data.ademe.fr', 'opendata.enedis.fr']) {
  for (const d of JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))) base.push(docFields(d, shadow, host))
}

console.log('| docs | candidates (OR / rarest) | A: naive node | B: rarest + projection | C: agg over OR | D: agg over rarest |')
console.log('|---|---|---|---|---|---|')

for (const N of [10000, 50000, 200000]) {
  const coll = db.collection(`ss_${N}`)
  await coll.drop().catch(() => {})
  const lenTotals = {}
  let batch = []
  for (let i = 0; i < N; i++) {
    const b = base[i % base.length]
    const fields = { ...b, title: `${b.title} ${i}` }
    const tf = {}; const len = {}; const terms = new Set()
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const ts = tokenizeStem(fields[field])
      len[field] = ts.length
      const counts = {}
      for (const t of ts) { counts[t] = (counts[t] ?? 0) + 1; terms.add(t) }
      if (ts.length) tf[field] = counts
      lenTotals[field] = (lenTotals[field] ?? 0) + ts.length
    }
    batch.push({ slug: `d${i}`, _terms: [...terms], _tf: tf, _len: len })
    if (batch.length >= 5000) { await coll.insertMany(batch); batch = [] }
  }
  if (batch.length) await coll.insertMany(batch)
  await coll.createIndex({ _terms: 1 })

  // a deliberately common multi-term query: the worst case for candidate-set size
  const qt = [...new Set(tokenizeStem('consommation electrique annuelle par commune'))]
  const dfs = {}
  for (const t of qt) dfs[t] = await coll.countDocuments({ _terms: t })
  const rarest = qt.slice().sort((a, b) => dfs[a] - dfs[b])[0]
  const idf = (t) => Math.log(1 + (N - dfs[t] + 0.5) / (dfs[t] + 0.5))
  const avgLen = {}
  for (const field of Object.keys(FIELD_WEIGHTS)) avgLen[field] = (lenTotals[field] ?? 0) / N || 1

  const scoreDoc = (d) => {
    let s = 0
    for (const t of qt) {
      const iv = idf(t)
      if (iv <= 0) continue
      for (const [field, w] of Object.entries(FIELD_WEIGHTS)) {
        const tf = d._tf?.[field]?.[t]
        if (!tf) continue
        s += w * iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d._len?.[field] ?? 0) / avgLen[field]))
      }
    }
    return s
  }
  const proj = { slug: 1, _len: 1 }
  for (const field of Object.keys(FIELD_WEIGHTS)) for (const t of qt) proj[`_tf.${field}.${t}`] = 1

  // the BM25F score, generated as an aggregation expression with the idf constants baked in
  const adds = []
  for (const t of qt) {
    const iv = idf(t)
    if (iv <= 0) continue
    for (const [field, w] of Object.entries(FIELD_WEIGHTS)) {
      adds.push({
        $let: {
          vars: { tf: { $ifNull: [`$_tf.${field}.${t}`, 0] }, l: { $ifNull: [`$_len.${field}`, 0] } },
          in: {
            $cond: [{ $eq: ['$$tf', 0] }, 0, {
              $multiply: [w * iv, {
                $divide: [{ $multiply: ['$$tf', K1 + 1] },
                  { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / avgLen[field], '$$l'] }] }] }] }]
              }]
            }]
          }
        }
      })
    }
  }
  const pipeline = (match) => [
    { $match: match },
    { $addFields: { _score: { $add: adds } } },
    { $sort: { _score: -1 } }, { $limit: 20 }, { $project: { slug: 1, _score: 1 } }
  ]

  const t = { A: [], B: [], C: [], D: [] }
  let candOr = 0; let candRare = 0
  for (let r = 0; r < 3; r++) {
    { const t0 = performance.now()
      const c = await coll.find({ _terms: { $in: qt } }).project({ slug: 1, _tf: 1, _len: 1 }).toArray()
      candOr = c.length
      c.map(d => ({ slug: d.slug, s: scoreDoc(d) })).sort((a, b) => b.s - a.s).slice(0, 20)
      t.A.push(performance.now() - t0) }
    { const t0 = performance.now()
      const c = await coll.find({ _terms: rarest }).project(proj).toArray()
      candRare = c.length
      c.map(d => ({ slug: d.slug, s: scoreDoc(d) })).sort((a, b) => b.s - a.s).slice(0, 20)
      t.B.push(performance.now() - t0) }
    { const t0 = performance.now(); await coll.aggregate(pipeline({ _terms: { $in: qt } }), { allowDiskUse: true }).toArray(); t.C.push(performance.now() - t0) }
    { const t0 = performance.now(); await coll.aggregate(pipeline({ _terms: rarest }), { allowDiskUse: true }).toArray(); t.D.push(performance.now() - t0) }
  }
  console.log(`| ${N} | ${candOr} / ${candRare} | ${median(t.A).toFixed(0)} ms | ${median(t.B).toFixed(0)} ms | ${median(t.C).toFixed(0)} ms | ${median(t.D).toFixed(0)} ms |`)
}
console.log('\nNOTE: the "rarest" column is UNSHIPPABLE as a retrieval policy — see retrieval-safety.mjs.')
console.log('It is kept here only to show where the cost goes. Use scoring-placement.mjs for safe gates.')
await client.close()
