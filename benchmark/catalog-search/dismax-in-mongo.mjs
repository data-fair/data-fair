// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// combination-rule.mjs showed dis_max is worth the whole ES gap. The design only benefits if
// dis_max can be GENERATED as an aggregation expression, so check three things:
//
//   node benchmark/catalog-search/dismax-in-mongo.mjs [mongodb://localhost:27017/catalog-search-bench]
//
//   1. it can be expressed at all — dis_max is a MAX over per-field scores, not a plain $add
//   2. it agrees EXACTLY with the node implementation that scored 168/170
//   3. what it costs against the plain sum (needs ss_* from scale-fixtures.mjs)
//
// Finding worth keeping: near-duplicate datasets produce EXACT score ties, and MongoDB's $sort
// leaves ties in an undefined order — 34 of 170 queries returned a different top-3 than node for
// that reason alone, with identical scores. A deterministic secondary sort key (`slug: 1`) brings
// the mismatches to zero. Any ranked listing needs one, or results wobble between identical calls.

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenizeStem, FIELD_WEIGHTS, K1, B, docFields, median as med } from './stem.mjs'

const { MongoClient } = await import('mongodb').catch(() => createRequire(path.join(process.cwd(), 'package.json'))('mongodb'))

const here = import.meta.dirname
const shadow = JSON.parse(await readFile(path.join(here, 'shadow.json'), 'utf8'))
const { catalogs } = JSON.parse(await readFile(path.join(here, 'queries-hard.json'), 'utf8'))
const tok = tokenizeStem
const FIELDS = FIELD_WEIGHTS
const TIE = 0.3 // ES multi_match tie_breaker
const fieldsOf = (d, host) => docFields(d, shadow, host)

// the generated dis_max expression: per-field score summed over terms, then max + TIE x rest
const dismaxExpr = (qt, idfFor, avgLen) => {
  const fieldScores = Object.entries(FIELDS).map(([f, w]) => ({
    $multiply: [w, {
      $add: qt.map(t => {
        const iv = idfFor(f, t)
        if (iv <= 0) return 0
        return {
          $let: {
            vars: { tf: { $ifNull: [`$_tf.${f}.${t}`, 0] }, l: { $ifNull: [`$_len.${f}`, 0] } },
            in: {
              $cond: [{ $eq: ['$$tf', 0] }, 0, {
                $multiply: [iv, {
                  $divide: [{ $multiply: ['$$tf', K1 + 1] },
                    { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / avgLen[f], '$$l'] }] }] }] }]
                }]
              }]
            }
          }
        }
      })
    }]
  }))
  return { $let: { vars: { fs: fieldScores }, in: { $add: [{ $max: '$$fs' }, { $multiply: [TIE, { $subtract: [{ $sum: '$$fs' }, { $max: '$$fs' }] }] }] } } }
}

const client = await MongoClient.connect(process.argv[2] ?? 'mongodb://localhost:27017/catalog-search-bench')
const db = client.db()

// ---- correctness: real corpora, node dis_max vs mongo dis_max, must agree exactly
let checked = 0; let mismatched = 0; let hit1 = 0; let nodeHit1 = 0; let total = 0
for (const [host, queries] of Object.entries(catalogs)) {
  const raw = JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))
  const docs = raw.map(d => ({ slug: d.slug, f: fieldsOf(d, host) }))
  const N = docs.length; const df = new Map(); const lensum = {}
  for (const d of docs) {
    d.tf = {}; d.len = {}
    const terms = new Set()
    for (const f of Object.keys(FIELDS)) {
      const ts = tok(d.f[f]); d.len[f] = ts.length
      const c = new Map(); for (const t of ts) c.set(t, (c.get(t) ?? 0) + 1)
      d.tf[f] = c; for (const t of c.keys()) terms.add(t)
      lensum[f] = (lensum[f] ?? 0) + ts.length
    }
    for (const t of terms) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const avg = {}; for (const f of Object.keys(FIELDS)) avg[f] = lensum[f] / N || 1
  const idf = (t) => { const v = df.get(t) ?? 0; return Math.log(1 + (N - v + 0.5) / (v + 0.5)) }

  const coll = db.collection(`dm_${host.replaceAll('.', '_')}`)
  await coll.drop().catch(() => {})
  await coll.insertMany(docs.map(d => ({
    slug: d.slug,
    _terms: [...new Set(Object.values(d.tf).flatMap(m => [...m.keys()]))],
    _tf: Object.fromEntries(Object.entries(d.tf).map(([f, m]) => [f, Object.fromEntries(m)])),
    _len: d.len
  })))
  await coll.createIndex({ _terms: 1 })

  for (const q of queries) {
    const qt = [...new Set(tok(q.q))]
    // node reference
    const nodeTop = docs.map(d => {
      const vals = Object.entries(FIELDS).map(([f, w]) => {
        let fs = 0
        for (const t of qt) {
          const tf = d.tf[f].get(t); if (!tf) continue; const iv = idf(t); if (iv <= 0) continue
          fs += iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len[f] / avg[f]))
        }
        return w * fs
      }).filter(v => v > 0)
      const mx = vals.length ? Math.max(...vals) : 0
      return { slug: d.slug, s: mx + TIE * (vals.reduce((a, b) => a + b, 0) - mx) }
    }).filter(x => x.s > 0).sort((a, b) => (b.s - a.s) || (a.slug < b.slug ? -1 : 1)).slice(0, 10).map(x => x.slug)
    // mongo
    const mongoTop = (await coll.aggregate([
      { $match: { _terms: { $in: qt } } },
      { $addFields: { _score: dismaxExpr(qt, (_f, t) => idf(t), avg) } },
      { $sort: { _score: -1, slug: 1 } }, { $limit: 10 }, { $project: { slug: 1, _score: 1 } }
    ]).toArray()).map(x => x.slug)
    checked++
    if (JSON.stringify(nodeTop.slice(0, 3)) !== JSON.stringify(mongoTop.slice(0, 3))) mismatched++
    total++
    if (q.expect.includes(mongoTop[0])) hit1++
    if (q.expect.includes(nodeTop[0])) nodeHit1++
  }
}
console.log(`correctness: ${checked} queries, top-3 mismatches between node and mongo: ${mismatched}`)
console.log(`dis_max hit@1 — mongo ${hit1}/${total}, node ${nodeHit1}/${total}   (ES best_fields = 168/170)`)

// ---- cost: dis_max vs plain sum at scale
console.log('\n| docs | gate | expression | wall | node CPU |')
console.log('|---|---|---|---|---|')
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }
for (const N of [50000, 200000]) {
  const coll = db.collection(`ss_${N}`)
  if (!await coll.estimatedDocumentCount()) continue
  const qt = [...new Set(tok('consommation electrique annuelle par commune'))]
  const dfs = {}; for (const t of qt) dfs[t] = await coll.countDocuments({ _terms: t })
  const gate = qt.slice().sort((a, b) => dfs[a] - dfs[b]).slice(0, 2)
  const idf = (t) => Math.log(1 + (N - dfs[t] + 0.5) / (dfs[t] + 0.5))
  const avgLen = {}; for (const f of Object.keys(FIELDS)) avgLen[f] = 40
  const sumExpr = {
    $add: qt.flatMap(t => Object.entries(FIELDS).map(([f, w]) => {
      const iv = idf(t); if (iv <= 0) return 0
      return {
        $let: {
          vars: { tf: { $ifNull: [`$_tf.${f}.${t}`, 0] }, l: { $ifNull: [`$_len.${f}`, 0] } },
          in: {
            $cond: [{ $eq: ['$$tf', 0] }, 0, {
              $multiply: [w * iv, {
                $divide: [{ $multiply: ['$$tf', K1 + 1] },
                  { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / avgLen[f], '$$l'] }] }] }] }]
              }]
            }]
          }
        }
      }
    }))
  }
  for (const [name, expr] of [['plain sum', sumExpr], ['dis_max (ES-equivalent)', dismaxExpr(qt, (_f, t) => idf(t), avgLen)]]) {
    const w = []; const c = []
    for (let r = 0; r < 4; r++) {
      const c0 = cpu(); const t0 = performance.now()
      await coll.aggregate([{ $match: { _terms: { $in: gate } } }, { $addFields: { _score: expr } },
        { $sort: { _score: -1 } }, { $limit: 20 }, { $project: { slug: 1, _score: 1 } }], { allowDiskUse: true }).toArray()
      w.push(performance.now() - t0); c.push(cpu() - c0)
    }
    console.log(`| ${N} | rarest 2 | ${name} | ${med(w).toFixed(0)} ms | ${med(c).toFixed(0)} ms |`)
  }
}
await client.close()
