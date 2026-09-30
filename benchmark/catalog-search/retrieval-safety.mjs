// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Rung 4 must score every CANDIDATE to know the top N, so the candidate predicate drives the cost.
// Narrowing candidates to the query's RAREST term is ~4x faster and, on the hard query set, loses
// NOTHING. That is a trap, and this script exists to expose it.
//
//   node benchmark/catalog-search/retrieval-safety.mjs
//
// The hard queries are built FROM each target's title, so the target always contains every query
// term, including the rarest. Rarest-term-only is therefore an AND on that one term, and the set
// structurally cannot show what happens when a user adds a word the target does NOT have — a typo,
// or a qualifier the dataset does not use. So the second half injects exactly that.
//
// Scoring (BM25F over the full query) is identical throughout; only eligibility changes.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenizeStem, FIELD_WEIGHTS, K1, B, docFields } from './stem.mjs'

const here = import.meta.dirname
const { catalogs } = JSON.parse(await readFile(path.join(here, 'queries-hard.json'), 'utf8'))
const shadow = JSON.parse(await readFile(path.join(here, 'shadow.json'), 'utf8'))

const byRarity = (qt, df) => qt.slice().sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0))
const POLICIES = {
  'OR all terms ($in)': (qt) => qt,
  'rarest term only': (qt, df) => byRarity(qt, df).slice(0, 1),
  'rarest 2 terms': (qt, df) => byRarity(qt, df).slice(0, 2),
  'rarest 3 terms': (qt, df) => byRarity(qt, df).slice(0, 3)
}

/** Index one catalog the way rung 4 would: per-field term counts, lengths, and corpus stats. */
const indexCatalog = (raw, host) => {
  const docs = raw.map(d => ({ slug: d.slug, f: docFields(d, shadow, host) }))
  const df = new Map(); const lensum = {}; const N = docs.length
  for (const d of docs) {
    d.tf = {}; d.len = {}; d.terms = new Set()
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const ts = tokenizeStem(d.f[field])
      d.len[field] = ts.length
      const c = new Map()
      for (const t of ts) c.set(t, (c.get(t) ?? 0) + 1)
      d.tf[field] = c
      for (const t of c.keys()) d.terms.add(t)
      lensum[field] = (lensum[field] ?? 0) + ts.length
    }
    for (const t of d.terms) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const avg = {}
  for (const field of Object.keys(FIELD_WEIGHTS)) avg[field] = lensum[field] / N || 1
  return { docs, df, avg, N }
}

const idfOf = (df, N) => (t) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))

const scoreAll = (cands, qt, idf, avg) => cands.map(d => {
  let s = 0
  for (const t of qt) {
    const iv = idf(t)
    if (iv <= 0) continue
    for (const [field, w] of Object.entries(FIELD_WEIGHTS)) {
      const tf = d.tf[field].get(t)
      if (!tf) continue
      s += w * iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len[field] / avg[field]))
    }
  }
  return { slug: d.slug, s }
}).sort((a, b) => b.s - a.s)

/** addNoise: given the target and the catalog's singleton terms, returns an extra query word. */
const measure = (addNoise) => {
  const res = {}
  for (const n of Object.keys(POLICIES)) res[n] = { ranks: [], cands: [] }
  return {
    res,
    run: async () => {
      for (const [host, queries] of Object.entries(catalogs)) {
        const raw = JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))
        const { docs, df, avg, N } = indexCatalog(raw, host)
        const idf = idfOf(df, N)
        const singles = [...df.entries()].filter(([, c]) => c === 1).map(([t]) => t)
        for (const q of queries) {
          const target = docs.find(d => q.expect.includes(d.slug))
          if (!target) continue
          const base = tokenizeStem(q.q)
          const extra = addNoise?.(target, singles)
          const qt = [...new Set(extra ? [...base, extra] : base)]
          for (const [name, pick] of Object.entries(POLICIES)) {
            const gate = new Set(pick(qt, df, N))
            const cands = docs.filter(d => { for (const t of gate) if (d.terms.has(t)) return true; return false })
            const ranked = scoreAll(cands, qt, idf, avg)
            const i = ranked.findIndex(r => q.expect.includes(r.slug))
            res[name].ranks.push(i === -1 ? null : i + 1)
            res[name].cands.push(cands.length)
          }
        }
      }
    }
  }
}

const report = (title, res) => {
  console.log(`\n## ${title}`)
  console.log('| candidate policy | hit@1 | hit@5 | MRR | NEVER RETRIEVED | median candidates |')
  console.log('|---|---|---|---|---|---|')
  for (const [name, r] of Object.entries(res)) {
    const n = r.ranks.length
    const mrr = (r.ranks.reduce((s, x) => s + (x ? 1 / x : 0), 0) / n).toFixed(3)
    const mc = [...r.cands].sort((a, b) => a - b)[Math.floor(n / 2)]
    console.log(`| ${name} | ${r.ranks.filter(x => x === 1).length}/${n} | ${r.ranks.filter(x => x && x <= 5).length}/${n} | ${mrr} | **${r.ranks.filter(x => x === null).length}** | ${mc} |`)
  }
}

const CASES = [
  ['queries as generated (target holds every term)', null],
  ['+ an unknown word (typo, absent from the corpus)', () => 'zzqxnotacorpusterm'],
  ['+ a rare REAL word the target does not use', (target, singles) => singles.find(t => !target.terms.has(t)) ?? 'zzqxnotacorpusterm']
]
for (const [title, noise] of CASES) {
  const m = measure(noise)
  await m.run()
  report(title, m.res)
}
console.log(`
CONCLUSION: rarest-term-only retrieval is unshippable. It costs nothing on queries drawn from the
target's own title, and returns NOTHING AT ALL as soon as one typo enters the query, because the
unknown term is by definition the rarest and becomes the gate. Two independent fixes are needed:
  - drop query terms with df = 0 (they cannot match or score anything) -> fixes the typo case
  - gate on the rarest K terms with K >= 2 -> covers a rare REAL word the target happens to lack
K must exceed the number of noise terms tolerated, since noise sorts to the rare end by construction.`)
