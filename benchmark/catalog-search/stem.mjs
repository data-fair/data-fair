// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Shared French analysis for the rung-4 scripts: the same pipeline the design proposes to run in
// node at index time — deaccent, lowercase, split, drop stopwords, stem. tokenize.mjs is the
// deliberately stemmer-free version used by the earlier $text analysis; this one stems, because
// rung 4 owns its own analyzer and per-document language is the whole point.
//
// Needs a stemmer that is NOT a data-fair dependency (the benchmarks are throwaway):
//   npm i --no-save @orama/stemmers

export const stemmer = await import('@orama/stemmers/french')
  .then(m => m.stemmer)
  .catch(() => {
    console.error('missing stemmer — run: npm i --no-save @orama/stemmers')
    process.exit(1)
  })

const deaccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Short closed stopword list, matching the one the design proposes to inline rather than depend on. */
export const STOP = new Set('au aux avec ce ces dans de des du en et la le les leur par pour sur un une ou a d l'.split(' '))

/** Query and document terms go through exactly the same function — that is the contract. */
export const tokenizeStem = (text, minLen = 2) => deaccent(text).toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(t => t.length >= minLen && !STOP.has(t))
  .map(stemmer)

/** Surface words a user would actually type — no stemming, used to build query strings. */
export const surfaceWords = (text, minLen = 3) => deaccent(text).toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(t => t.length >= minLen && !STOP.has(t))

/** The indexed fields and their production weights (api/src/mongo.ts). */
export const FIELD_WEIGHTS = { title: 3, searchTerms: 3, summary: 2, description: 1, keywords: 1, topics: 1, _searchText: 1 }

/** BM25F constants. */
export const K1 = 1.2
export const B = 0.75

/** The content of one dataset, as the design would index it. */
export const docFields = (d, shadow, host) => ({
  title: d.title ?? '',
  searchTerms: shadow?.[host]?.[d.slug] ?? '',
  summary: d.summary ?? '',
  description: d.description ?? '',
  keywords: (d.keywords ?? []).join(' '),
  topics: (d.topics ?? []).map(t => t.title).join(' '),
  _searchText: (d.schema ?? [])
    .filter(p => !p['x-calculated'] && !p['x-extension'])
    .map(p => [p.title, p.description].filter(Boolean).join(' '))
    .filter(Boolean).join('\n')
})

export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
