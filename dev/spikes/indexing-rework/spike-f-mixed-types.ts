import { es, resetIndex, bulkIndex, finding } from './es.ts'

// Question: an OPTIONAL derivation rule maps a long-value column's MAIN field to ES
// `wildcard` while older (already-indexed) siblings keep it as `keyword` (ignore_above 200).
// Do multi-index queries spanning both still behave, or is this main-type-swap unusable
// under virtual datasets / organic migration?

const SHARED = 'AAA-1'
const LONG_KW = 'L'.repeat(250) + '-kw-only'
const LONG_WC = 'L'.repeat(250) + '-wc-only'

const kwDocs = [
  { col: SHARED },
  { col: 'KW-UNIQUE-1' },
  { col: 'KW-UNIQUE-2' },
  { col: LONG_KW } // >200 chars: ignore_above 200 on keyword silently drops indexing of this value (control)
]
const wcDocs = [
  { col: SHARED },
  { col: 'WC-UNIQUE-1' },
  { col: 'WC-UNIQUE-2' },
  { col: LONG_WC } // >200 chars: wildcard has no ignore_above, must be found
]

await resetIndex('spike-f-kw', { mappings: { properties: { col: { type: 'keyword', ignore_above: 200 } } } })
await resetIndex('spike-f-wc', { mappings: { properties: { col: { type: 'wildcard' } } } })
await bulkIndex('spike-f-kw', kwDocs)
await bulkIndex('spike-f-wc', wcDocs)

// helper: pull shards.failed + first failure reason for the mandatory discipline
const shardsInfo = (r: any) => {
  const failed = r._shards.failed
  if (!failed) return `shards.failed:0`
  const reason = r._shards.failures?.[0]?.reason?.reason ?? JSON.stringify(r._shards.failures?.[0]).slice(0, 150)
  return `shards.failed:${failed} — ${reason}`
}

const BOTH = '/spike-f-kw,spike-f-wc/_search'

// 1. term query on the shared value
const term = await es('POST', BOTH, { query: { term: { col: SHARED } } })
finding(`cross-index term on shared value '${SHARED}': ${term.hits.total.value} hits (expect 2), ${shardsInfo(term)}`)

// 2. prefix query
const prefix = await es('POST', BOTH, { query: { prefix: { col: 'AAA-' } } })
finding(`cross-index prefix 'AAA-': ${prefix.hits.total.value} hits (expect 2), ${shardsInfo(prefix)}`)

// 3. range query
const range = await es('POST', BOTH, { query: { range: { col: { gte: 'AAA', lt: 'AAB' } } } })
finding(`cross-index range [AAA, AAB): ${range.hits.total.value} hits (expect 2), ${shardsInfo(range)}`)

// 4. terms agg on col — critical: does the shared value merge into ONE bucket with doc_count 2?
const agg = await es('POST', BOTH, { size: 0, aggs: { v: { terms: { field: 'col', size: 100 } } } })
const buckets = agg.aggregations.v.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(', ')
const sharedBucket = agg.aggregations.v.buckets.find((b: any) => b.key === SHARED)
finding(`cross-index terms agg buckets: [${buckets}], ${shardsInfo(agg)}`)
finding(`cross-index terms agg shared-value bucket merge: ${sharedBucket ? `ONE bucket, doc_count ${sharedBucket.doc_count} (expect 2)` : 'NOT MERGED — appears as separate/missing buckets'}`)

// 5. cardinality agg
const card = await es('POST', BOTH, { size: 0, aggs: { c: { cardinality: { field: 'col' } } } })
finding(`cross-index cardinality: ${card.aggregations.c.value}, ${shardsInfo(card)}`)

// 6. sort asc
const sort = await es('POST', BOTH, { sort: [{ col: 'asc' }], size: 100, _source: ['col'] })
finding(`cross-index sort asc order: ${sort.hits.hits.map((h: any) => h._source.col).join(' | ')}, ${shardsInfo(sort)}`)

// 7. wildcard query on a substring of the shared value
const wc = await es('POST', BOTH, { query: { wildcard: { col: { value: '*AA-1*' } } } })
finding(`cross-index wildcard '*AA-1*': ${wc.hits.total.value} hits (expect 2), ${shardsInfo(wc)}`)

// 8. exists query
const exists = await es('POST', BOTH, { query: { exists: { field: 'col' } } })
finding(`cross-index exists: ${exists.hits.total.value} hits (expect 8, 4 per index), ${shardsInfo(exists)}`)

// control: confirm keyword side silently dropped the >200-char value from doc_values/indexed terms
// (it's still stored in _source, but not searchable/aggregatable as itself due to ignore_above)
const kwLongTerm = await es('POST', '/spike-f-kw/_search', { query: { term: { col: LONG_KW } } })
finding(`control: keyword-side term on its own >200-char value: ${kwLongTerm.hits.total.value} hits (expect 0 — ignore_above silently drops it)`)
const wcLongTerm = await es('POST', '/spike-f-wc/_search', { query: { term: { col: LONG_WC } } })
finding(`control: wildcard-side term on its own >200-char value: ${wcLongTerm.hits.total.value} hits (expect 1 — wildcard has no ignore_above)`)

// diagnosis aid: same queries run on each index alone (only if a cross-index result looked anomalous;
// run unconditionally here since they are cheap and make the merge/no-merge finding easier to audit)
for (const idx of ['spike-f-kw', 'spike-f-wc']) {
  const soloAgg = await es('POST', `/${idx}/_search`, { size: 0, aggs: { v: { terms: { field: 'col', size: 100 } } } })
  const soloBuckets = soloAgg.aggregations.v.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(', ')
  finding(`solo ${idx} terms agg buckets: [${soloBuckets}], ${shardsInfo(soloAgg)}`)
}

await es('DELETE', '/spike-f-kw'); await es('DELETE', '/spike-f-wc')
console.log('spike F done')
