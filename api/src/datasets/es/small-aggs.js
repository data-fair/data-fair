import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.js'
import es from '#es'

export const max = async (dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    max: {
      max: { field: fieldKey }
    }
  }
  const esResponse = await es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })
  return esResponse.aggregations.max.value
}

export const min = async (dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    min: {
      min: { field: fieldKey }
    }
  }
  const esResponse = await es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })
  return esResponse.aggregations.min.value
}
