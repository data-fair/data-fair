import { es, resetIndex, bulkIndex, finding, time } from './es.ts'

const N = 50_000
const docs = Array.from({ length: N }, (_, i) => ({
  code: `REF-${String(i % 9000).padStart(4, '0')}-${['AA', 'BB', 'CC'][i % 3]}`,
  long: i % 100 === 0 ? 'L'.repeat(150) + `unique-${i}-` + 'x'.repeat(300) : `short-${i % 500}`
}))

await resetIndex('spike-b-kw', { mappings: { properties: { code: { type: 'keyword' }, long: { type: 'keyword', ignore_above: 200 } } } })
await resetIndex('spike-b-wc', { mappings: { properties: { code: { type: 'wildcard' }, long: { type: 'wildcard' } } } })
await bulkIndex('spike-b-kw', docs)
await bulkIndex('spike-b-wc', docs)

for (const idx of ['spike-b-kw', 'spike-b-wc']) {
  const label = idx.endsWith('kw') ? 'keyword ' : 'wildcard'
  const term = await es('POST', `/${idx}/_search`, { query: { term: { code: 'REF-0042-AA' } } })
  const prefix = await es('POST', `/${idx}/_search`, { query: { prefix: { code: 'REF-004' } } })
  const range = await es('POST', `/${idx}/_search`, { query: { range: { code: { gte: 'REF-0100', lt: 'REF-0200' } } } })
  const exists = await es('POST', `/${idx}/_count`, { query: { exists: { field: 'long' } } })
  const contains = await es('POST', `/${idx}/_search`, { query: { wildcard: { code: { value: '*42-A*' } } } })
  const longHit = await es('POST', `/${idx}/_search`, { query: { wildcard: { long: { value: '*unique-100-*' } } } })
  finding(`${label} term:${term.hits.total.value} prefix:${prefix.hits.total.value} range:${range.hits.total.value} exists:${exists.count} contains:${contains.hits.total.value} longValueFound:${longHit.hits.total.value}`)
  // keyword index MUST lose the >200-char values (ignore_above); wildcard MUST find them
  const tTerm = await time(label + ' term', 20, () => es('POST', `/${idx}/_search`, { query: { term: { code: 'REF-0042-AA' } } }))
  const tAgg = await time(label + ' terms-agg', 20, () => es('POST', `/${idx}/_search`, { size: 0, aggs: { v: { terms: { field: 'code', size: 100 } } } }))
  const tSort = await time(label + ' sort', 20, () => es('POST', `/${idx}/_search`, { size: 100, sort: [{ code: 'asc' }] }))
  const tCard = await time(label + ' cardinality', 20, () => es('POST', `/${idx}/_search`, { size: 0, aggs: { c: { cardinality: { field: 'code' } } } }))
  const tContains = await time(label + ' contains', 20, () => es('POST', `/${idx}/_search`, { query: { wildcard: { code: { value: '*42-A*' } } } }))
  finding(`${label} medians ms — term:${tTerm.toFixed(1)} agg:${tAgg.toFixed(1)} sort:${tSort.toFixed(1)} cardinality:${tCard.toFixed(1)} contains:${tContains.toFixed(1)}`)
}
const stats = await es('GET', '/spike-b-kw,spike-b-wc/_stats/store')
for (const [name, s] of Object.entries<any>(stats.indices)) {
  finding(`${name} store ${(s.primaries.store.size_in_bytes / 1e6).toFixed(1)} MB`)
}
await es('DELETE', '/spike-b-kw'); await es('DELETE', '/spike-b-wc')
console.log('spike B done')
