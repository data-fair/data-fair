// Same judged queries, same corpus, against a real Elasticsearch index built with data-fair's own
// French analyzer (copied from api/src/datasets/es/manage-indices.ts). Measures what BM25 + IDF buy
// over the Mongo text index, variant by variant, on the same content.
//
//   node benchmark/catalog-search/es-ab.mjs [http://localhost:9771]
//
// Uses indices prefixed `catalog-search-bench-`, never data-fair's.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { renderReport } from './scoring.mjs'

const es = process.argv[2] ?? 'http://localhost:9771'
const { catalogs } = JSON.parse(await readFile(path.join(import.meta.dirname, 'queries.json'), 'utf8'))
const shadow = JSON.parse(await readFile(path.join(import.meta.dirname, 'shadow.json'), 'utf8'))
const outDir = path.join(import.meta.dirname, 'results')
await mkdir(outDir, { recursive: true })

const req = async (method, p, body) => {
  const res = await fetch(es + p, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${p}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

const analysis = {
  filter: {
    french_elision: { type: 'elision', articles_case: true, articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c', 'jusqu', 'quoiqu', 'lorsqu', 'puisqu'] },
    french_stop: { type: 'stop', stopwords: '_french_' },
    french_stemmer: { type: 'stemmer', language: 'light_french' }
  },
  analyzer: {
    custom_french: { tokenizer: 'standard', filter: ['french_elision', 'lowercase', 'french_stop', 'french_stemmer', 'asciifolding'] }
  }
}
const text = { type: 'text', analyzer: 'custom_french' }
const mappings = {
  dynamic: 'strict',
  properties: { slug: { type: 'keyword' }, title: text, summary: text, description: text, keywords: text, topics: text, _searchText: text, shadowContent: text }
}

const dataColumns = (d) => (d.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension'])
const cols = (d) => dataColumns(d).map(p => [p.title, p.description].filter(Boolean).join(' ')).filter(Boolean).join('\n')

// the production mongo weights, expressed as query-time boosts
const BASE_FIELDS = ['title^3', 'summary^2', 'description', 'keywords', 'topics']

// name → { fields, type, extra: which document fields to fill }
const VARIANTS = {
  es_base: { fields: BASE_FIELDS, type: 'best_fields' },
  es_cross: { fields: BASE_FIELDS, type: 'cross_fields' },
  es_cols: { fields: [...BASE_FIELDS, '_searchText'], type: 'best_fields', cols: true },
  es_shadowcols: { fields: [...BASE_FIELDS, '_searchText', 'shadowContent^3'], type: 'best_fields', cols: true, shadow: true }
}

for (const [host, queries] of Object.entries(catalogs)) {
  const datasets = JSON.parse(await readFile(path.join(import.meta.dirname, 'corpus', `${host}.json`), 'utf8'))
  const index = `catalog-search-bench-${host.replaceAll('.', '-')}`
  await req('DELETE', `/${index}`)
  await req('PUT', `/${index}`, { settings: { number_of_shards: 1, analysis }, mappings })
  const bulk = datasets.flatMap(d => [
    { index: { _index: index, _id: d.slug } },
    {
      slug: d.slug,
      title: d.title,
      summary: d.summary,
      description: d.description,
      keywords: d.keywords,
      topics: (d.topics ?? []).map(t => t.title),
      _searchText: cols(d) || undefined,
      shadowContent: shadow[host]?.[d.slug]
    }
  ])
  await fetch(`${es}/_bulk?refresh=true`, { method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body: bulk.map(l => JSON.stringify(l)).join('\n') + '\n' })

  const results = {}
  for (const [name, variant] of Object.entries(VARIANTS)) {
    results[name] = []
    for (const query of queries) {
      const body = {
        size: 10,
        _source: ['slug'],
        track_total_hits: true,
        query: { multi_match: { query: query.q, fields: variant.fields, type: variant.type, operator: 'or', ...(variant.type === 'best_fields' ? { tie_breaker: 0.3 } : {}) } }
      }
      const r = await req('POST', `/${index}/_search`, body)
      results[name].push({ ...query, count: r.hits.total.value, top: r.hits.hits.map(h => h._source.slug) })
    }
  }
  const report = renderReport(`ES A/B ${host} (${datasets.length} datasets)`, results)
  console.log(report)
  await writeFile(path.join(outDir, `es-ab-${host}.md`), report)
}
