import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.js'

export default async (client, dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const sort = query.sort ?? 'asc'
  delete query.sort
  const esQuery = prepareQuery(dataset, query, [fieldKey], { lenient: true, analyze_wildcard: true }, true)
  if (esQuery.size > 1000) throw httpError(400, '"size" cannot be more than 1000')
  const size = esQuery.size
  esQuery.size = 0
  esQuery.aggs = {
    values: {
      terms: {
        field: fieldKey,
        size,
        order: {
          // alphabetical order by default
          _key: sort
        }
      }
    }
  }

  if (query.q) {
    // top hit relevance order in case of a filter
    esQuery.aggs.values.terms.order = [{ max_score: 'desc' }, { _count: 'desc' }, { _key: 'asc' }]
    esQuery.aggs.values.aggs = {
      max_score: {
        max: {
          script: '_score'
        }
      }
    }
  }
  // Bound complexity with a timeout
  const esResponse = await client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })
  return esResponse.aggregations.values.buckets.map(b => b.key_as_string || b.key).map(v => query.stringify === 'true' ? (v + '') : v)
}
