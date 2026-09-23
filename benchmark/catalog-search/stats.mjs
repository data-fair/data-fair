// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Coverage and vocabulary-gain statistics over the pulled corpus.
//
//   node benchmark/catalog-search/stats.mjs
//
// Two questions, kept apart on purpose:
//  - coverage: how filled is each metadata on live catalogs today (a completeness signal, not a
//    verdict on the strategy that would index it)
//  - vocabulary gain: when a dataset carries schema labels / enum values, how many search terms do
//    they add that the currently indexed prose (title, summary, description, keywords, topics) lacks

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { tokenize } from './tokenize.mjs'

const dir = path.join(import.meta.dirname, 'corpus')
const files = (await readdir(dir)).filter(f => f.endsWith('.json'))

const pct = (n, d) => d ? `${Math.round(100 * n / d)}%` : '-'
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

// what the current mongo fulltext index sees, minus owner names (identical across a catalog)
const indexedProse = (d) => [d.title, d.summary, d.description, ...(d.keywords ?? []), ...(d.topics ?? []).map(t => t.title)].filter(Boolean).join(' ')

const dataColumns = (d) => (d.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension'])

for (const file of files) {
  const datasets = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
  const n = datasets.length
  console.log(`\n## ${file.replace('.json', '')} — ${n} datasets`)

  // --- coverage
  const has = (key, pred = v => Array.isArray(v) ? v.length > 0 : !!v) => datasets.filter(d => pred(d[key])).length
  const withEnum = datasets.filter(d => dataColumns(d).some(p => p.enum)).length
  const withTitledCols = datasets.filter(d => dataColumns(d).some(p => p.title && p.title !== p.key && p.title !== p['x-originalName'])).length
  const withDescribedCols = datasets.filter(d => dataColumns(d).some(p => p.description)).length
  const withConcepts = datasets.filter(d => dataColumns(d).some(p => p['x-refersTo'])).length
  console.log('coverage:')
  for (const [label, count] of [
    ['summary', has('summary')], ['description', has('description')], ['keywords', has('keywords')],
    ['topics', has('topics')], ['relatedDatasets', has('relatedDatasets')], ['license', has('license')],
    ['≥1 column with enum', withEnum], ['≥1 column title ≠ key', withTitledCols],
    ['≥1 column description', withDescribedCols], ['≥1 column concept', withConcepts]
  ]) console.log(`  ${label.padEnd(26)} ${pct(count, n).padStart(5)}  (${count})`)

  // --- vocabulary gain, only over datasets that carry the metadata in question
  const gains = { colTitles: [], colDescriptions: [], colKeys: [], enums: [] }
  const enumSizes = []
  const noise = { enumNumeric: 0, enumTotal: 0 }
  for (const d of datasets) {
    const base = new Set(tokenize(indexedProse(d)))
    const cols = dataColumns(d)
    const add = (bucket, text) => {
      const toks = new Set(tokenize(text))
      if (!toks.size) return
      let novel = 0
      for (const t of toks) if (!base.has(t)) novel++
      gains[bucket].push({ id: d.id, total: toks.size, novel })
    }
    add('colTitles', cols.map(p => p.title).filter(Boolean).join(' '))
    add('colDescriptions', cols.map(p => p.description).filter(Boolean).join(' '))
    add('colKeys', cols.map(p => p.key).join(' '))
    const enums = cols.flatMap(p => p.enum ?? [])
    if (enums.length) {
      enumSizes.push(enums.length)
      for (const v of enums) { noise.enumTotal++; if (typeof v !== 'string' || /^[\d\s.,/-]+$/.test(v)) noise.enumNumeric++ }
      add('enums', enums.filter(v => typeof v === 'string').join(' '))
    }
  }
  console.log('vocabulary gain (datasets carrying it → median terms, median novel terms, share novel):')
  for (const [bucket, rows] of Object.entries(gains)) {
    if (!rows.length) { console.log(`  ${bucket.padEnd(16)} none`); continue }
    const totalTerms = rows.reduce((s, r) => s + r.total, 0)
    const novelTerms = rows.reduce((s, r) => s + r.novel, 0)
    console.log(`  ${bucket.padEnd(16)} ${String(rows.length).padStart(4)} ds → ${String(median(rows.map(r => r.total))).padStart(4)} terms, ${String(median(rows.map(r => r.novel))).padStart(4)} novel, ${pct(novelTerms, totalTerms)} novel overall`)
  }
  if (enumSizes.length) console.log(`  enum values per dataset: median ${median(enumSizes)}, max ${Math.max(...enumSizes)}; numeric/code-like values ${pct(noise.enumNumeric, noise.enumTotal)}`)
}
