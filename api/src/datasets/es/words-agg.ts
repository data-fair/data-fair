import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import capabilities from '../../../contract/capabilities.js'
import { columnOperationsHint, buildWordsAggs } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'

export default async (client: Client, dataset: any, query: Record<string, any>, abortContext?: EsAbortContext) => {
  if (!query.field) throw httpError(400, '"field" parameter is required')
  const prop = dataset.schema.find((f: any) => f.key === query.field)
  if (!prop) {
    throw httpError(400, `Impossible d'agréger sur le champ ${query.field}, il n'existe pas dans le jeu de données.`)
  }
  if (prop['x-capabilities'] && !prop['x-capabilities'].textAgg) {
    throw httpError(400, `Impossible d'agréger sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties.textAgg.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
  }

  const field = query.analysis === 'standard' ? query.field + '.text_standard' : query.field + '.text'
  const size = Number(query.size || 20)
  if (size > 200) throw httpError(400, 'Cette aggrégation ne peut pas retourner plus de 200 mots.')
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  delete esQuery._source
  delete esQuery.sort

  const aggType = (query.q || query._c_q || query.qs) ? 'significant_text' : 'terms'

  esQuery.aggs = buildWordsAggs(aggType, field, size)

  // console.log(esQuery)
  const esResponse: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))

  const buckets = esResponse.aggregations.sample.words.buckets

  const words = await Promise.all(buckets.map((bucket: any) => unstem(client, dataset, field, bucket.key, abortContext)))

  return {
    total: esResponse.hits.total.value,
    sample: esResponse.aggregations.sample.doc_count,
    results: buckets.map((bucket: any, i: number) => ({
      word: words[i],
      total: bucket.doc_count,
      score: bucket.score
    }))
  }
}

// significant_text does not "unstem"
// it is suggested that the highlight logic is the closest there is to satisfying this need
// so we search for the analyzed term in the documents, get highlights and get the most frequest highlighted piece of text
async function unstem (client: Client, dataset: any, field: string, key: any, abortContext?: EsAbortContext) {
  // this raw query is built directly against aliasName(dataset), bypassing prepareQuery — so on its
  // own it applies neither the top-level `virtual.filters` nor the descendants-scoped filters, and
  // could return highlighted fragments sourced from rows a virtual dataset (or an intermediate
  // virtual child) hides. Reuse prepareQuery's scoping (called with an empty query: only the
  // invariant filters, no user-supplied q/qs/etc) as an extra filter alongside the term clause.
  // For a non-virtual, unfiltered dataset this resolves to an empty/no-op bool clause, so behavior
  // there is unchanged.
  const scopeQuery = prepareQuery(dataset, {}).query
  const res: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: {
      size: 20,
      query: { bool: { filter: [{ term: { [field]: key } }, scopeQuery] } },
      _source: { excludes: '*' },
      highlight: {
        fields: { [field]: {} },
        fragment_size: 1,
        pre_tags: '<>',
        post_tags: '<>'
      }
    },
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))

  const words: Record<string, number> = {}
  for (const hit of res.hits.hits) {
    for (let w of hit.highlight[field]) {
      w = w.match(/<>(.*)<>/)[1]
      // lowercase only if full uppercase.
      // this way we keep only meaningful uppercase letters
      if (w.toUpperCase() === w) w = w.toLowerCase()
      words[w] = (words[w] || 0) + 1
    }
  }
  return Object.keys(words).sort((a, b) => words[a] < words[b] ? 1 : -1)[0]
}
