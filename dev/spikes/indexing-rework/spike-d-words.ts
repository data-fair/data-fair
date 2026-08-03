import { es, resetIndex, bulkIndex, finding, ANALYSIS_SETTINGS } from './es.ts'

await resetIndex('spike-d', {
  settings: { analysis: ANALYSIS_SETTINGS },
  mappings: {
    properties: {
      desc: {
        type: 'keyword',
        ignore_above: 200,
        fields: {
          text: { type: 'text', analyzer: 'custom_french', fielddata: true },
          text_standard: { type: 'text', analyzer: 'standard', fielddata: true }
        }
      }
    }
  }
})
const phrases = [
  'Les communes françaises publient leurs données',
  'La commune de Marseille publie un jeu de données',
  'Données publiées par les communes',
  'Une donnée publiée est une donnée utile'
]
await bulkIndex('spike-d', Array.from({ length: 100 }, (_, i) => ({ desc: phrases[i % phrases.length] })))

// mirror of the real buildWordsAggs (api/src/datasets/es/operations.ts:697) — NOTE the nested key
// under "sample" is "aggregations" (not "aggs") and significant_text carries filter_duplicate_text:true,
// both faithfully replicated here after reading the real function (see task-5-report.md).
function buildWordsAggs (aggType: 'terms' | 'significant_text', field: string, size: number) {
  const aggs: Record<string, any> = {
    sample: {
      sampler: { shard_size: 1000 },
      aggregations: {
        words: { [aggType]: { field, size } }
      }
    }
  }
  if (aggType === 'significant_text') {
    aggs.sample.aggregations.words.significant_text.filter_duplicate_text = true
  }
  return aggs
}

for (const field of ['desc.text', 'desc.text_standard']) {
  const terms = await es('POST', '/spike-d/_search', { size: 0, aggs: buildWordsAggs('terms', field, 10) })
  finding(`${field} terms buckets: ` + terms.aggregations.sample.words.buckets.map((b: any) => `${b.key}(${b.doc_count})`).join(', '))

  const sig = await es('POST', '/spike-d/_search', { query: { match: { [field]: 'commune' } }, size: 0, aggs: buildWordsAggs('significant_text', field, 10) })
  finding(`${field} significant_text buckets: ` + sig.aggregations.sample.words.buckets.map((b: any) => b.key).join(', '))

  // unstem pass (words-agg.ts:57): term on the analyzed field + highlight
  const stemmed = terms.aggregations.sample.words.buckets[0].key
  const un = await es('POST', '/spike-d/_search', {
    size: 5,
    query: { term: { [field]: stemmed } },
    _source: false,
    highlight: {
      fields: { [field]: {} },
      fragment_size: 1,
      pre_tags: '<>',
      post_tags: '<>'
    }
  })
  const frag = un.hits.hits[0]?.highlight?.[field]?.[0]
  finding(`${field} unstem: top stem "${stemmed}" -> highlight fragment "${frag}"`)
}
await es('DELETE', '/spike-d')
console.log('spike D done')
