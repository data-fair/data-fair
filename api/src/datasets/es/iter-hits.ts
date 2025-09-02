import config from '#config'
import es from '#es'
import type { Dataset } from '#types'
import { prepareQuery, aliasName } from './commons.js'

async function * iterHits (dataset: Dataset, query: { size: number } & Record<string, string | number> = { size: 1000 }) {
  const esQuery = prepareQuery(dataset, query, undefined, undefined, true, true)
  const index = aliasName(dataset)

  while (true) {
    const hits: any[] = (await es.client.search({
      index,
      body: esQuery,
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })).hits.hits
    yield hits
    if (hits.length < query.size) break
    esQuery.search_after = hits[hits.length - 1].sort
  }
}

export default iterHits
