import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.js'
import { timedEsCall } from './abort.js'
import es from '#es'

/** @param {import('./abort.js').EsAbortContext} [abortContext] */
export const max = async (dataset, fieldKey, query, abortContext) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    max: {
      max: { field: fieldKey }
    }
  }
  const esResponse = await timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return esResponse.aggregations.max.value
}

/** @param {import('./abort.js').EsAbortContext} [abortContext] */
export const min = async (dataset, fieldKey, query, abortContext) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    min: {
      min: { field: fieldKey }
    }
  }
  const esResponse = await timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return esResponse.aggregations.min.value
}
