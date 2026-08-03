import { es, resetIndex, bulkIndex, finding, ANALYSIS_SETTINGS } from './es.ts'

await resetIndex('spike-c', { settings: { analysis: ANALYSIS_SETTINGS }, mappings: { properties: {
  name: { type: 'keyword', normalizer: 'insensitive_normalizer' }
} } })
await bulkIndex('spike-c', [
  { name: 'Éric' }, { name: 'eric' }, { name: 'ERIC' }, { name: 'Zoé' }, { name: 'alba' }
])

const agg = await es('POST', '/spike-c/_search', { size: 0, aggs: { v: { terms: { field: 'name', order: { _key: 'asc' } } } } })
finding('terms agg buckets: ' + agg.aggregations.v.buckets.map((b: any) => `${b.key}(${b.doc_count})`).join(', '))
// expect the 3 Éric variants merged into one normalized bucket "eric"

const sorted = await es('POST', '/spike-c/_search', { sort: [{ name: 'asc' }], _source: ['name'] })
finding('sort asc returns _source order: ' + sorted.hits.hits.map((h: any) => h._source.name).join(' | '))
finding('sort keys (hit.sort): ' + sorted.hits.hits.map((h: any) => h.sort[0]).join(' | '))

const t1 = await es('POST', '/spike-c/_count', { query: { term: { name: 'ÉRIC' } } })
const t2 = await es('POST', '/spike-c/_count', { query: { term: { name: 'eric' } } })
finding(`term query normalization: term:"ÉRIC" -> ${t1.count} docs, term:"eric" -> ${t2.count} docs (expect both 3 — query-side normalization applies)`)

// original-value recovery for display: top_hits sub-agg
const aggTh = await es('POST', '/spike-c/_search', { size: 0, aggs: { v: { terms: { field: 'name' }, aggs: {
  original: { top_hits: { size: 1, _source: ['name'] } }
} } } })
finding('top_hits recovery per bucket: ' + aggTh.aggregations.v.buckets.map((b: any) => `${b.key} -> ${b.original.hits.hits[0]._source.name}`).join(', '))

await es('DELETE', '/spike-c')
console.log('spike C done')
