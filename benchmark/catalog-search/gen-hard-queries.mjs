// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Auto-generate a DISCRIMINATING query set, because the 56 hand-written queries in queries.json
// had SATURATED: against the content this branch indexes, production already scored 50/56 hit@1,
// so the set could not tell engines apart at all.
//
//   node benchmark/catalog-search/gen-hard-queries.mjs     (writes queries-hard.json)
//
// Method, deliberately unbiased — no hand-picking of examples that flatter one engine:
//   for every dataset, form the query a person would type from its title (stopwords dropped), and
//   keep it only if (a) it holds at least one GENERIC term, present in >=8% of that catalog's
//   titles, so the engine must discriminate rather than merely match, and (b) exactly one dataset
//   has that full term set, so the expected answer is unambiguous.
//
// That isolates the class an IDF-less scorer is known to mis-rank, at realistic scale.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenizeStem, surfaceWords } from './stem.mjs'

const here = import.meta.dirname
const out = {}
for (const host of ['opendata.koumoul.com', 'data.ademe.fr', 'opendata.enedis.fr']) {
  const raw = JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))
  const df = new Map()
  for (const d of raw) for (const t of new Set(tokenizeStem(d.title, 3))) df.set(t, (df.get(t) ?? 0) + 1)
  const genericAt = Math.max(2, Math.ceil(raw.length * 0.08))

  // term-set signature -> slugs, to keep only unambiguous targets
  const sig = new Map()
  for (const d of raw) {
    const k = [...new Set(tokenizeStem(d.title, 3))].sort().join('|')
    sig.set(k, [...(sig.get(k) ?? []), d.slug])
  }

  const queries = []
  for (const d of raw) {
    const words = surfaceWords(d.title)
    if (words.length < 3 || words.length > 9) continue
    const stems = [...new Set(tokenizeStem(d.title, 3))]
    const generic = stems.filter(t => (df.get(t) ?? 0) >= genericAt)
    if (!generic.length) continue // nothing to discriminate -> not interesting here
    if ((sig.get(stems.slice().sort().join('|')) ?? []).length !== 1) continue // ambiguous target
    queries.push({
      q: words.join(' '),
      expect: [d.slug],
      genericTerms: generic.length,
      maxDf: Math.max(...stems.map(t => df.get(t) ?? 0)) / raw.length
    })
  }
  out[host] = queries
  const avgGeneric = (queries.reduce((s, q) => s + q.genericTerms, 0) / queries.length).toFixed(1)
  const avgMaxDf = (queries.reduce((s, q) => s + q.maxDf, 0) / queries.length * 100).toFixed(0)
  console.log(`${host}: ${queries.length} hard queries (generic >=${genericAt}/${raw.length} titles; avg ${avgGeneric} generic terms/query; avg commonest term in ${avgMaxDf}% of titles)`)
}
await writeFile(path.join(here, 'queries-hard.json'), JSON.stringify({ catalogs: out }, null, 1))
console.log('total:', Object.values(out).reduce((s, q) => s + q.length, 0))
