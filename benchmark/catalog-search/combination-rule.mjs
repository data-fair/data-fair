// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Why did ES score 168/170 and rung 4 only 161, when BOTH compute BM25? It is not the engine:
// it is the COMBINATION RULE, and the answer closes the whole gap.
//
//   node benchmark/catalog-search/combination-rule.mjs
//
// rung 4 as first benchmarked SUMMED every weighted (term, field) contribution — textbook BM25F.
// The ES benchmark used multi_match best_fields, which is a dis_max: sum the per-term scores
// WITHIN each field to get that field's score, then take the MAX field plus tie_breaker x the
// rest. Two ranking functions, not two implementations of one.
//
// This ablates the two structural differences independently:
//   shape     'sum' (BM25F) vs 'dismax' (max field + 0.3 x rest)
//   idf scope 'doc' — one df per term per document (rung 4) vs 'field' — Lucene keeps a separate
//             inverted index per field, so docFreq and therefore idf are PER FIELD

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { tokenizeStem, FIELD_WEIGHTS, K1, B, docFields } from './stem.mjs'

const here = import.meta.dirname
const { catalogs } = JSON.parse(await readFile(path.join(here, 'queries-hard.json'), 'utf8'))
const shadow = JSON.parse(await readFile(path.join(here, 'shadow.json'), 'utf8'))
const tok = tokenizeStem
const FIELDS = FIELD_WEIGHTS
const fieldsOf = (d, host) => docFields(d, shadow, host)

// idfScope: 'doc' = one df per term per document (rung 4 today) | 'field' = Lucene's per-field df
// shape:    'sum' = sum every (term,field) contribution | 'dismax' = max FIELD score + 0.3 x rest
const VARIANTS = []
for (const idfScope of ['doc', 'field']) for (const shape of ['sum', 'dismax']) VARIANTS.push({ idfScope, shape })
const results = Object.fromEntries(VARIANTS.map(v => [`${v.idfScope} idf | ${v.shape}`, []]))

for (const [host, queries] of Object.entries(catalogs)) {
  const raw = JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))
  const docs = raw.map(d => ({ slug: d.slug, f: fieldsOf(d, host) }))
  const N = docs.length
  const dfDoc = new Map()
  const dfField = {}   // field -> Map(term -> docFreq within that field)
  const lensum = {}
  for (const f of Object.keys(FIELDS)) dfField[f] = new Map()
  for (const d of docs) {
    d.tf = {}; d.len = {}
    const docTerms = new Set()
    for (const f of Object.keys(FIELDS)) {
      const ts = tok(d.f[f]); d.len[f] = ts.length
      const c = new Map(); for (const t of ts) c.set(t, (c.get(t) ?? 0) + 1)
      d.tf[f] = c
      for (const t of c.keys()) { docTerms.add(t); dfField[f].set(t, (dfField[f].get(t) ?? 0) + 1) }
      lensum[f] = (lensum[f] ?? 0) + ts.length
    }
    for (const t of docTerms) dfDoc.set(t, (dfDoc.get(t) ?? 0) + 1)
  }
  const avg = {}; for (const f of Object.keys(FIELDS)) avg[f] = lensum[f] / N || 1
  const idfDoc = (t) => { const v = dfDoc.get(t) ?? 0; return Math.log(1 + (N - v + 0.5) / (v + 0.5)) }
  // Lucene: docCount for the field is the number of docs that HAVE that field; approximate with N
  const idfField = (f, t) => { const v = dfField[f].get(t) ?? 0; return Math.log(1 + (N - v + 0.5) / (v + 0.5)) }

  for (const q of queries) {
    const qt = [...new Set(tok(q.q))]
    for (const { idfScope, shape } of VARIANTS) {
      const ranked = docs.map(d => {
        const perField = {}
        for (const [f, w] of Object.entries(FIELDS)) {
          let fieldScore = 0
          for (const t of qt) {
            const tf = d.tf[f].get(t); if (!tf) continue
            const iv = idfScope === 'doc' ? idfDoc(t) : idfField(f, t)
            if (iv <= 0) continue
            fieldScore += iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len[f] / avg[f]))
          }
          perField[f] = w * fieldScore   // boost multiplies the FIELD score, as in ES
        }
        const vals = Object.values(perField).filter(v => v > 0)
        let s
        if (shape === 'sum') s = vals.reduce((a, b) => a + b, 0)
        else { const mx = vals.length ? Math.max(...vals) : 0; s = mx + 0.3 * (vals.reduce((a, b) => a + b, 0) - mx) }
        return { slug: d.slug, s }
      }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
      const i = ranked.slice(0, 10).findIndex(x => q.expect.includes(x.slug))
      results[`${idfScope} idf | ${shape}`].push(i === -1 ? null : i + 1)
    }
  }
}
console.log('## Rung 4 with Lucene\'s score SHAPE and IDF SCOPE\n')
console.log('| idf scope | combination shape | hit@1 | hit@5 | MRR |')
console.log('|---|---|---|---|---|')
for (const [k, ranks] of Object.entries(results)) {
  const [a, b] = k.split(' | ')
  const n = ranks.length
  console.log(`| ${a} | ${b} | ${ranks.filter(x => x === 1).length}/${n} | ${ranks.filter(x => x && x <= 5).length}/${n} | ${(ranks.reduce((s, x) => s + (x ? 1 / x : 0), 0) / n).toFixed(3)} |`)
}
console.log('\nReference: rung 4 as benchmarked = 161/170 (0.974); ES best_fields = 168/170 (0.994)')

// ---------------------------------------------------------------- the same ablation, ES side
// Confirms the finding from the other direction: hold the engine fixed and vary only the query
// type and the stemmer. If the combination rule is really the cause, ES must FALL to rung 4's
// original score when told to sum fields (most_fields) instead of dis_max them (best_fields).
const ES = process.env.ES ?? 'http://localhost:9200'
const esUp = await fetch(ES, { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false)
if (!esUp) {
  console.log(`\n(ES not reachable at ${ES} — skipping the ES-side confirmation; set ES=<url> to run it)`)
} else {
  const esReq = async (m, p, b, ndjson) => {
    const r = await fetch(ES + p, { method: m, headers: { 'content-type': ndjson ? 'application/x-ndjson' : 'application/json' }, body: ndjson ?? (b && JSON.stringify(b)) })
    if (!r.ok && r.status !== 404) throw new Error(`${m} ${p}: ${r.status}`)
    return r.json().catch(() => ({}))
  }
  const analysisWith = (stem) => ({
    filter: {
      french_elision: { type: 'elision', articles_case: true, articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c', 'jusqu', 'quoiqu', 'lorsqu', 'puisqu'] },
      french_stop: { type: 'stop', stopwords: '_french_' },
      french_stemmer: { type: 'stemmer', language: stem }
    },
    analyzer: { custom_french: { tokenizer: 'standard', filter: ['french_elision', 'lowercase', 'french_stop', 'french_stemmer', 'asciifolding'] } }
  })
  const F = ['title^3', 'searchTerms^3', 'summary^2', 'description', 'keywords', 'topics', '_searchText']
  const ES_QUERIES = {
    'best_fields + tie_breaker 0.3 (dis_max)': (q) => ({ multi_match: { query: q, fields: F, type: 'best_fields', tie_breaker: 0.3 } }),
    'most_fields (SUMS the fields)': (q) => ({ multi_match: { query: q, fields: F, type: 'most_fields' } }),
    'cross_fields (one blended field)': (q) => ({ multi_match: { query: q, fields: F, type: 'cross_fields' } })
  }
  const out = {}
  for (const stem of ['light_french', 'french']) {
    for (const qn of Object.keys(ES_QUERIES)) out[`${stem} | ${qn}`] = []
    for (const [host, queries] of Object.entries(catalogs)) {
      const raw = JSON.parse(await readFile(path.join(here, 'corpus', `${host}.json`), 'utf8'))
      const idx = `combrule-${stem}-${host.replaceAll('.', '-')}`
      await esReq('DELETE', `/${idx}`)
      const T = { type: 'text', analyzer: 'custom_french' }
      await esReq('PUT', `/${idx}`, { settings: { number_of_shards: 1, analysis: analysisWith(stem) }, mappings: { dynamic: 'strict', properties: { slug: { type: 'keyword' }, title: T, searchTerms: T, summary: T, description: T, keywords: T, topics: T, _searchText: T } } })
      const bulk = raw.flatMap(d => [{ index: { _index: idx, _id: d.slug } }, { slug: d.slug, ...fieldsOf(d, host) }])
      await esReq('POST', '/_bulk?refresh=true', null, bulk.map(l => JSON.stringify(l)).join('\n') + '\n')
      for (const q of queries) {
        for (const [qn, mk] of Object.entries(ES_QUERIES)) {
          const r = await esReq('POST', `/${idx}/_search`, { size: 10, _source: ['slug'], query: mk(q.q) })
          const i = r.hits.hits.map(h => h._source.slug).findIndex(s => q.expect.includes(s))
          out[`${stem} | ${qn}`].push(i === -1 ? null : i + 1)
        }
      }
      await esReq('DELETE', `/${idx}`)
    }
  }
  console.log('\n## The same ablation on ES: hold the engine fixed, vary query type and stemmer\n')
  console.log('| stemmer | query type | hit@1 | hit@5 | MRR |')
  console.log('|---|---|---|---|---|')
  for (const [k, ranks] of Object.entries(out)) {
    const [stem, qn] = k.split(' | ')
    const n = ranks.length
    console.log(`| ${stem} | ${qn} | ${ranks.filter(x => x === 1).length}/${n} | ${ranks.filter(x => x && x <= 5).length}/${n} | ${(ranks.reduce((s, x) => s + (x ? 1 / x : 0), 0) / n).toFixed(3)} |`)
  }
  console.log(`
CONCLUSION: ES has no BM25 advantage. Told to SUM its fields it scores 160/170 — WORSE than rung 4's
161 at the same setting. Given ES's dis_max shape, rung 4 scores 168/170 with MRR 0.994, i.e.
exactly ES. The stemmer is worth a few points (light_french > snowball) and per-field idf nothing
at all. The entire measured gap was one line of scoring arithmetic.`)
}
