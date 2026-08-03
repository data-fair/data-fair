import { es, resetIndex, bulkIndex, finding, ANALYSIS_SETTINGS } from './es.ts'

// Question: footprint win of the SUBSET shape (legacy-compatible: keep legacy field names/types,
// materialize only the subfields implied by column metadata) vs gen1 — as opposed to the earlier
// radical shape measured in spike-e-size.ts.

const WORDS = 'commune donnée publication service transport école santé budget région département contrat marché habitant surface projet'.split(' ')
const sentence = (n: number, seed: number) => Array.from({ length: n }, (_, i) => WORDS[(seed * 7 + i * 13) % WORDS.length]).join(' ')
const N = 100_000
const docs = Array.from({ length: N }, (_, i) => ({
  id: `rec-${i}`,
  code: `INSEE-${String(i % 35000).padStart(5, '0')}`,
  category: ['transport', 'santé', 'éducation', 'culture', 'sport', 'économie', 'environnement', 'urbanisme', 'social', 'tourisme'][i % 10],
  name: sentence(3, i),
  description: sentence(40, i),
  longtext: sentence(60, i * 3) + ' ' + 'détail '.repeat(20),
  price: (i % 10000) / 100,
  date: new Date(Date.UTC(2020 + (i % 6), i % 12, 1 + (i % 28))).toISOString()
}))

// generation 1: current esProperty defaults (everything cumulative) — identical to spike-e-size.ts
const g1String = (extra: any = {}) => ({
  type: 'keyword', ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' },
    keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
  },
  ...extra
})
const gen1 = { settings: { analysis: ANALYSIS_SETTINGS }, mappings: { properties: {
  id: g1String(), code: g1String(), category: g1String(), name: g1String(), description: g1String(), longtext: g1String(),
  price: { type: 'double', fields: { text_standard: { type: 'text', analyzer: 'standard' } } },
  date: { type: 'date', fields: { text_standard: { type: 'text', analyzer: 'standard' } } }
} } }

// generation 2 (subset shape): legacy field names/types kept, only subfields implied by column
// metadata materialized one-at-a-time (per the pivoted "legacy-compatible subset" design)
const gen2 = { settings: { analysis: ANALYSIS_SETTINGS }, mappings: { properties: {
  id: { type: 'keyword', ignore_above: 200, doc_values: false },
  code: { type: 'keyword', ignore_above: 200 },
  category: {
    type: 'keyword', ignore_above: 200,
    fields: { keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' } }
  },
  name: {
    type: 'keyword', ignore_above: 200,
    fields: {
      keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' },
      text: { type: 'text', analyzer: 'custom_french' }
    }
  },
  description: {
    type: 'keyword', ignore_above: 200, index: false, doc_values: false,
    fields: { text: { type: 'text', analyzer: 'custom_french' } }
  },
  longtext: {
    type: 'keyword', ignore_above: 200, index: false, doc_values: false,
    fields: { text: { type: 'text', analyzer: 'custom_french' } }
  },
  price: { type: 'double' },
  date: { type: 'date' }
} } }

for (const [name, def] of [['spike-e2-gen1', gen1], ['spike-e2-gen2', gen2]] as const) {
  await resetIndex(name, def)
  const t0 = performance.now()
  await bulkIndex(name, docs)
  await es('POST', '/' + name + '/_forcemerge?max_num_segments=1')
  finding(`${name} bulk+merge ${(performance.now() - t0).toFixed(0)}ms for ${N} docs`)
}
const stats = await es('GET', '/spike-e2-gen1,spike-e2-gen2/_stats/store')
const g1b = stats.indices['spike-e2-gen1'].primaries.store.size_in_bytes
const g2b = stats.indices['spike-e2-gen2'].primaries.store.size_in_bytes
finding(`store gen1 ${(g1b / 1e6).toFixed(1)} MB vs gen2 ${(g2b / 1e6).toFixed(1)} MB -> gen2 is ${(100 - 100 * g2b / g1b).toFixed(0)}% smaller`)
await es('DELETE', '/spike-e2-gen1'); await es('DELETE', '/spike-e2-gen2')
console.log('spike E2 done')
