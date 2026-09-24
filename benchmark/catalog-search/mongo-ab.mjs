// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Real-engine A/B: load each pulled catalog into a scratch MongoDB database, build the datasets
// text index in several variants (index language × extra indexed content) and run the judged
// query set through each one. This is the only way to see actual $text scoring rather than a
// tokenizer's guess.
//
//   node benchmark/catalog-search/mongo-ab.mjs [mongodb://localhost:3502/catalog-search-bench]
//
// Uses a dedicated database, never the data-fair one. Run from a directory whose node_modules
// carries the mongodb driver (the main data-fair checkout does).

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { renderReport } from './scoring.mjs'

const { MongoClient } = await import('mongodb').catch(() => createRequire(path.join(process.cwd(), 'package.json'))('mongodb'))

const url = process.argv[2] ?? 'mongodb://localhost:3502/catalog-search-bench'
const { catalogs } = JSON.parse(await readFile(path.join(import.meta.dirname, 'queries.json'), 'utf8'))
const outDir = path.join(import.meta.dirname, 'results')
await mkdir(outDir, { recursive: true })

// the production index (api/src/mongo.ts) minus owner names, identical across one catalog
const BASE_FIELDS = { title: 'text', summary: 'text', description: 'text', keywords: 'text', 'topics.title': 'text' }
const BASE_WEIGHTS = { title: 3, summary: 2 }

const dataColumns = (d) => (d.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension'])
const content = {
  cols: (d) => dataColumns(d).map(p => [p.title, p.description].filter(Boolean).join(' ')).filter(Boolean).join('\n'),
  keys: (d) => dataColumns(d).map(p => p.key).join(' '),
  enums: (d) => dataColumns(d).flatMap(p => (p.enum ?? []).filter(v => typeof v === 'string')).join('\n')
}

// hand-written stand-ins for an assistant-filled shadow field, per catalog and slug
const shadow = JSON.parse(await readFile(path.join(import.meta.dirname, 'shadow.json'), 'utf8'))

// name → { language, parts: which content buckets feed _searchText, shadow: index the shadow field }
const VARIANTS = {
  base_en: { language: 'english', parts: [] },
  base_fr: { language: 'french', parts: [] },
  cols_en: { language: 'english', parts: ['cols'] },
  cols_fr: { language: 'french', parts: ['cols'] },
  colskeys_fr: { language: 'french', parts: ['cols', 'keys'] },
  enums_fr: { language: 'french', parts: ['enums'] },
  all_fr: { language: 'french', parts: ['cols', 'keys', 'enums'] },
  shadow_fr: { language: 'french', parts: [], shadow: true },
  shadowcols_fr: { language: 'french', parts: ['cols'], shadow: true },
  // same as shadowcols_fr with the shadow field weighted like a title
  shadow3cols_fr: { language: 'french', parts: ['cols'], shadow: true, shadowWeight: 3 },
  // poor-man's IDF: query terms present in more than DF_MAX of the catalog are dropped from the
  // query when at least one rarer term remains (df measured with the engine itself, one count per term)
  shadow3cols_fr_df: { language: 'french', parts: ['cols'], shadow: true, shadowWeight: 3, dfStrip: true }
}
const DF_MAX = 0.3

const stripFrequentTerms = async (coll, q, total) => {
  const terms = q.split(/\s+/).filter(Boolean)
  const kept = []
  for (const term of terms) {
    const df = await coll.countDocuments({ $text: { $search: term } })
    if (df === 0) continue // stopword or absent: contributes nothing either way
    if (df / total <= DF_MAX) kept.push(term)
  }
  return kept.length ? kept.join(' ') : q
}

const client = await MongoClient.connect(url)
const db = client.db()

for (const [host, queries] of Object.entries(catalogs)) {
  const datasets = JSON.parse(await readFile(path.join(import.meta.dirname, 'corpus', `${host}.json`), 'utf8'))
  const results = {}
  for (const [name, variant] of Object.entries(VARIANTS)) {
    const coll = db.collection(`${host.replaceAll('.', '_')}__${name}`)
    await coll.drop().catch(() => {})
    await coll.insertMany(datasets.map(d => ({
      slug: d.slug,
      title: d.title,
      summary: d.summary,
      description: d.description,
      keywords: d.keywords,
      topics: d.topics,
      ...(variant.parts.length ? { _searchText: variant.parts.map(p => content[p](d)).filter(Boolean).join('\n') } : {}),
      ...(variant.shadow && shadow[host]?.[d.slug] ? { shadowContent: shadow[host][d.slug] } : {})
    })))
    await coll.createIndex(
      { ...BASE_FIELDS, ...(variant.parts.length ? { _searchText: 'text' } : {}), ...(variant.shadow ? { shadowContent: 'text' } : {}) },
      { name: 'fulltext', weights: { ...BASE_WEIGHTS, ...(variant.shadowWeight ? { shadowContent: variant.shadowWeight } : {}) }, default_language: variant.language }
    )
    results[name] = []
    for (const query of queries) {
      const q = variant.dfStrip ? await stripFrequentTerms(coll, query.q, datasets.length) : query.q
      const filter = { $text: { $search: q } }
      const [count, top] = await Promise.all([
        coll.countDocuments(filter),
        coll.find(filter).project({ slug: 1, score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).limit(10).toArray()
      ])
      results[name].push({ ...query, count, top: top.map(r => r.slug) })
    }
  }
  const report = renderReport(`mongo A/B ${host} (${datasets.length} datasets)`, results)
  console.log(report)
  await writeFile(path.join(outDir, `mongo-ab-${host}.md`), report)
}

await client.close()
