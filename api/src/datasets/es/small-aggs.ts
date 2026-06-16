import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import es from '#es'

export const max = async (dataset: any, fieldKey: string, query: Record<string, any>, abortContext?: EsAbortContext) => {
  const field = dataset.schema.find((p: any) => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    max: {
      max: { field: fieldKey }
    }
  }
  const esResponse: any = await timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return esResponse.aggregations.max.value
}

export const min = async (dataset: any, fieldKey: string, query: Record<string, any>, abortContext?: EsAbortContext) => {
  const field = dataset.schema.find((p: any) => p.key === fieldKey)
  if (!field) throw httpError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    min: {
      min: { field: fieldKey }
    }
  }
  const esResponse: any = await timedEsCall(abortContext, () => es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return esResponse.aggregations.min.value
}
