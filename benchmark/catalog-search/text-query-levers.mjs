// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Negative result, measured rather than assumed: can a plain mongo $text index be made IDF-aware
// AT QUERY TIME (boosting the rare terms of the query) without touching the index?
//
//   node benchmark/catalog-search/text-query-levers.mjs [mongodb://localhost:27017/catalog-search-bench]
//
// Probes the three things one would try before concluding it is impossible.

import { createRequire } from 'node:module'
import path from 'node:path'

const { MongoClient } = await import('mongodb').catch(() => createRequire(path.join(process.cwd(), 'package.json'))('mongodb'))

const client = await MongoClient.connect(process.argv[2] ?? 'mongodb://localhost:27017/catalog-search-bench')
const db = client.db()
const coll = db.collection('text-query-levers')
await coll.drop().catch(() => {})
await coll.insertMany([
  { _id: 1, title: 'consommation electrique par commune', body: 'commune' },
  { _id: 2, title: 'consommation de gaz par region', body: 'region' },
  { _id: 3, title: 'annuaire des communes', body: 'commune commune commune' }
])
await coll.createIndex({ title: 'text', body: 'text' }, { default_language: 'french', weights: { title: 3 } })

const run = async (label, q) => {
  try {
    const r = await coll.find({ $text: { $search: q } }).project({ s: { $meta: 'textScore' } }).sort({ s: { $meta: 'textScore' } }).toArray()
    console.log(`${label.padEnd(46)} ${r.map(d => `#${d._id}:${d.s.toFixed(3)}`).join('  ')}`)
  } catch (e) { console.log(`${label.padEnd(46)} ERROR: ${e.message.split('\n')[0].slice(0, 90)}`) }
}
const tryFilter = async (label, filter) => {
  try {
    const r = await coll.find(filter).project({ s: { $meta: 'textScore' } }).toArray()
    console.log(`${label.padEnd(46)} ${r.length} docs`)
  } catch (e) { console.log(`${label.padEnd(46)} ERROR: ${e.message.split('\n')[0].slice(0, 90)}`) }
}

// 1. the obvious trick: say the rare term more often. Mirrors rung 3, which works at INDEX time.
console.log('--- 1. does repeating a query term boost it? ---')
await run('"commune"', 'commune')
await run('"commune commune commune"', 'commune commune commune')
await run('"consommation commune"', 'consommation commune')
await run('"consommation commune commune commune"', 'consommation commune commune commune')

// 2. failing that, weight terms by combining separately-scored sub-queries.
console.log('\n--- 2. can two $text expressions be combined to weight terms? ---')
await tryFilter('$and of two $text', { $and: [{ $text: { $search: 'commune' } }, { $text: { $search: 'consommation' } }] })
await tryFilter('$or of two $text', { $or: [{ $text: { $search: 'commune' } }, { $text: { $search: 'consommation' } }] })

// 3. failing that, correct the score afterwards — which needs a per-term breakdown.
console.log('\n--- 3. other query-time levers, and what the score exposes ---')
await run('"par commune" (quoted phrase)', '"par commune"')
await run('consommation -gaz (negation)', 'consommation -gaz')
const agg = await coll.aggregate([
  { $match: { $text: { $search: 'consommation commune' } } },
  { $project: { score: { $meta: 'textScore' } } }
]).toArray()
console.log(`${'$meta textScore in an aggregation'.padEnd(46)} ${agg.map(d => `#${d._id}:${d.score.toFixed(3)}`).join('  ')}  <- one opaque scalar, no per-term breakdown`)

console.log(`
CONCLUSION: no query-time term boosting is possible.
  - query terms are DEDUPLICATED, so repetition is a no-op (contrast rung 3, where repeating a
    term into a hidden field at INDEX time does raise its tf and does work: 154/170)
  - only ONE $text expression is allowed per query, so terms cannot be scored separately
  - textScore is a single opaque scalar, so it cannot be decomposed and re-weighted afterwards
  - weights are per-FIELD and fixed at index creation, never per-term and never per-query
The only query-time lever is which terms you INCLUDE (dropping generic ones = rung 2, +5 hit@1).
Repetition counts on the document side, not the query side.`)
await coll.drop().catch(() => {})
await client.close()
