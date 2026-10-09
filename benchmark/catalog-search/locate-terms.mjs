// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Where does a term live in a catalog: prose (title/summary/description/keywords/topics),
// column titles+descriptions, column keys, or enum values? Used to craft judged queries that test
// one indexing choice at a time.
//
//   node benchmark/catalog-search/locate-terms.mjs opendata.koumoul.com HLM "fauteuil roulant" ...

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenize } from './tokenize.mjs'

const [host, ...terms] = process.argv.slice(2)
const datasets = JSON.parse(await readFile(path.join(import.meta.dirname, 'corpus', `${host}.json`), 'utf8'))

const cols = (d) => (d.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension'])
const buckets = (d) => ({
  prose: tokenize([d.title, d.summary, d.description, ...(d.keywords ?? []), ...(d.topics ?? []).map(t => t.title)].join(' ')),
  colText: tokenize(cols(d).map(p => [p.title, p.description].filter(Boolean).join(' ')).join(' ')),
  colKeys: tokenize(cols(d).map(p => p.key).join(' ')),
  enums: tokenize(cols(d).flatMap(p => p.enum ?? []).filter(v => typeof v === 'string').join(' '))
})
const index = datasets.map(d => ({ slug: d.slug, b: Object.fromEntries(Object.entries(buckets(d)).map(([k, v]) => [k, new Set(v)])) }))

for (const term of terms) {
  const toks = tokenize(term)
  const hits = {}
  for (const { slug, b } of index) {
    for (const [bucket, set] of Object.entries(b)) {
      if (toks.every(t => set.has(t))) (hits[bucket] ??= []).push(slug)
    }
  }
  console.log(`\n"${term}"`)
  for (const bucket of ['prose', 'colText', 'colKeys', 'enums']) {
    const h = hits[bucket] ?? []
    console.log(`  ${bucket.padEnd(8)} ${String(h.length).padStart(3)}  ${h.slice(0, 6).join(', ')}${h.length > 6 ? ' …' : ''}`)
  }
}
