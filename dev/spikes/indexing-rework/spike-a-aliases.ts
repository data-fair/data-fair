import { es, resetIndex, bulkIndex, assert, finding, ANALYSIS_SETTINGS } from './es.ts'

const SETTINGS = { settings: { analysis: ANALYSIS_SETTINGS } }
const DOCS = [
  { col1: 'Épée Ancienne', col2: 'ABC-123-' + 'x'.repeat(300) },
  { col1: 'epee moderne', col2: 'DEF-456' }
]

// gen2 shape: col1 = insensitive keyword + single .text (french); col2 = wildcard-typed
const gen2Props: any = {
  col1: {
    type: 'keyword', normalizer: 'insensitive_normalizer',
    fields: { text: { type: 'text', analyzer: 'custom_french' } }
  },
  col2: { type: 'wildcard' }
}

// --- Attempt 1: alias as a multi-field ---
try {
  await resetIndex('spike-a-mf', { ...SETTINGS, mappings: { properties: {
    col1: { ...gen2Props.col1, fields: { ...gen2Props.col1.fields, text_standard: { type: 'alias', path: 'col1.text' } } }
  } } })
  finding('alias INSIDE multi-fields: ACCEPTED')
} catch (err: any) {
  finding('alias INSIDE multi-fields: REJECTED -> ' + err.message.split('\n')[1]?.slice(0, 200))
}

// --- Attempt 2: top-level dotted alias name next to a concrete keyword field ---
try {
  await resetIndex('spike-a-dot', { ...SETTINGS, mappings: { properties: {
    ...gen2Props,
    'col1.text_standard': { type: 'alias', path: 'col1.text' },
    'col1.keyword_insensitive': { type: 'alias', path: 'col1' },
    'col2.wildcard': { type: 'alias', path: 'col2' }
  } } })
  finding('top-level dotted alias names: ACCEPTED')
  await bulkIndex('spike-a-dot', DOCS)
  // exercise every consumer surface through the aliases
  const qs = await es('POST', '/spike-a-dot/_search', { query: { query_string: { query: 'col1.text_standard:épée' } } })
  finding(`query_string via alias col1.text_standard: ${qs.hits.total.value} hits (expect 1)`)
  const qsW = await es('POST', '/spike-a-dot/_search', { query: { query_string: { query: 'col2.wildcard:*BC\\-123*' } } })
  finding(`query_string via alias col2.wildcard on wildcard type: ${qsW.hits.total.value} hits (expect 1)`)
  const sorted = await es('POST', '/spike-a-dot/_search', { sort: [{ 'col1.keyword_insensitive': 'asc' }], _source: ['col1'] })
  finding(`sort via alias col1.keyword_insensitive order: ${sorted.hits.hits.map((h: any) => h._source.col1).join(' | ')}`)
  const agg = await es('POST', '/spike-a-dot/_search', { size: 0, aggs: { v: { terms: { field: 'col1.keyword_insensitive' } } } })
  finding(`terms agg via alias keys: ${agg.aggregations.v.buckets.map((b: any) => b.key).join(', ')}`)
} catch (err: any) {
  finding('top-level dotted alias names: REJECTED -> ' + err.message.split('\n')[1]?.slice(0, 200))
}

// --- Mixed-generation multi-index behavior (virtual datasets), with or without aliases ---
// gen1 shape for the same logical column
await resetIndex('spike-a-gen1', { ...SETTINGS, mappings: { properties: { col1: {
  type: 'keyword', ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' },
    keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
  }
} } } })
await bulkIndex('spike-a-gen1', [{ col1: 'Épée gen1' }])
await resetIndex('spike-a-gen2', { ...SETTINGS, mappings: { properties: { col1: gen2Props.col1 } } })
await bulkIndex('spike-a-gen2', [{ col1: 'Épée gen2' }])

const multi = await es('POST', '/spike-a-gen1,spike-a-gen2/_search', { query: { query_string: { query: 'col1.text_standard:épée' } } })
finding(`multi-index query_string on col1.text_standard (only gen1 has it): ${multi.hits.total.value} hits — gen2 rows silently ${multi.hits.total.value === 1 ? 'excluded' : '??'}`)
try {
  const ms = await es('POST', '/spike-a-gen1,spike-a-gen2/_search', { sort: [{ 'col1.keyword_insensitive': 'asc' }] })
  finding(`multi-index sort on .keyword_insensitive without unmapped_type: OK, ${ms.hits.hits.length} hits`)
} catch (err: any) {
  finding('multi-index sort on .keyword_insensitive without unmapped_type: FAILS -> ' + err.message.split('\n')[1]?.slice(0, 200))
}
const ms2 = await es('POST', '/spike-a-gen1,spike-a-gen2/_search', { sort: [{ 'col1.keyword_insensitive': { order: 'asc', unmapped_type: 'keyword' } }], _source: ['col1'] })
finding(`multi-index sort with unmapped_type: order = ${ms2.hits.hits.map((h: any) => h._source.col1).join(' | ')}`)

for (const idx of ['spike-a-mf', 'spike-a-dot', 'spike-a-gen1', 'spike-a-gen2']) await es('DELETE', '/' + idx).catch(() => {})
console.log('spike A done')
