import { httpError } from '@data-fair/lib-utils/http-errors.js'
import moment from 'moment-timezone'
import config from '#config'
import { prepareQuery, aliasName } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import capabilities from '../../../contract/capabilities.js'
import { columnOperationsHint } from './operations.ts'
import { type Client } from '@elastic/elasticsearch'

const acceptedMetricAggsByType = {
  number: ['avg', 'sum', 'min', 'max', 'stats', 'value_count', 'percentiles', 'cardinality'],
  string: ['min', 'max', 'cardinality', 'value_count'],
  other: ['value_count']
}
export const acceptedMetricAggs: string[] = []
for (const metrics of Object.values(acceptedMetricAggsByType)) {
  for (const metric of metrics) {
    if (!acceptedMetricAggs.includes(metric)) acceptedMetricAggs.push(metric)
  }
}
const defaultMetricAggsByType = {
  number: ['min', 'max'],
  string: ['cardinality'],
  other: []
}

const cleanValue = (field: any, metric: string, value: any) => {
  if (['min', 'max', 'percentiles'].includes(metric)) {
    if (field.type === 'string' && field.format === 'date') return moment(value).format('YYYY-MM-DD')
    if (field.type === 'string' && field.format === 'date-time') return moment.tz(value, field.timeZone || config.defaultTimeZone).format()
  }
  return value
}

const getValueFromAggRes = (field: any, metric: string, aggRes: any) => {
  if (aggRes.value !== undefined) return cleanValue(field, metric, aggRes.value)
  else if (aggRes.values !== undefined) return aggRes.values.map((v: any) => cleanValue(field, metric, v))
  else return cleanValue(field, metric, aggRes)
}

const getMetricType = (field: any) => {
  if (field.type === 'integer' || field.type === 'number') {
    return 'number'
  } else if (field.type === 'string' && (field.format === 'date' || field.format === 'date-time')) {
    return 'number'
  } else if (field.type === 'string') {
    return 'string'
  } else {
    return 'other'
  }
}

export const assertMetricAccepted = (field: any, metric: string) => {
  const metricType = getMetricType(field)
  const acceptedAggs = acceptedMetricAggsByType[metricType]
  if (!acceptedAggs?.includes(metric)) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${field.key}. La métrique "${metric}", n'est pas supportée pour ce type de champ.`)
  }
}

export const agg = async (client: Client, dataset: any, query: Record<string, any>, abortContext?: EsAbortContext) => {
  if (!query.metric) throw httpError(400, '"metric" parameter is required')
  const metricField = query.field || query.metric_field
  if (!metricField) throw httpError(400, '"field" parameter is required')
  const field = dataset.schema.find((f: any) => f.key === metricField)
  if (!field) throw httpError(400, `Impossible de calculer une métrique sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
  if (field['x-capabilities'] && field['x-capabilities'].values === false) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
  }
  assertMetricAccepted(field, query.metric)

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    metric: {
      [query.metric]: { field: metricField }
    }
  }
  if (query.metric === 'percentiles') {
    esQuery.aggs.metric.percentiles.keyed = false
    if (query.percents) {
      esQuery.aggs.metric.percentiles.percents = query.percents.split(',')
    }
  }
  if (query.metric === 'cardinality') {
    // number after which we accept that cardinality is approximative
    const precisionThreshold = Number(query.precision_threshold ?? '40000')
    esQuery.aggs.metric.cardinality.precision_threshold = precisionThreshold
  }
  const esResponse: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  const response: any = { total: esResponse.hits.total.value }
  response.metric = getValueFromAggRes(field, query.metric, esResponse.aggregations.metric)
  return response
}

export const simpleMetricsAgg = async (client: Client, dataset: any, query: Record<string, any>, abortContext?: EsAbortContext) => {
  let fields
  if (query.fields) {
    fields = query.fields.split(',')
  } else {
    fields = dataset.schema
      .filter((f: any) => !f['x-capabilities'] || f['x-capabilities'].values !== false)
      .filter((f: any) => !f['x-calculated']).map((f: any) => f.key)
  }

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {}

  let globalMetrics
  if (query.metrics) globalMetrics = query.metrics.split(',')

  for (const metricField of fields) {
    const field = dataset.schema.find((f: any) => f.key === metricField)
    if (!field) throw httpError(400, `Impossible de calculer des métriques sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
    if (field['x-capabilities'] && field['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
    }
    if (globalMetrics) {
      for (const metric of globalMetrics) {
        assertMetricAccepted(field, metric)
      }
    }
    const metrics = globalMetrics ?? defaultMetricAggsByType[getMetricType(field)]
    for (const metric of metrics) {
      esQuery.aggs[metricField + ':' + metric] = {
        [metric]: { field: metricField }
      }
    }
  }
  const esResponse: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  const response: any = { total: esResponse.hits.total.value, metrics: {} }
  for (const metricField of fields) {
    response.metrics[metricField] = {}
    const field = dataset.schema.find((f: any) => f.key === metricField)
    const metrics = globalMetrics ?? defaultMetricAggsByType[getMetricType(field)]
    for (const metric of metrics) {
      response.metrics[metricField][metric] = getValueFromAggRes(field, metric, esResponse.aggregations[metricField + ':' + metric])
    }
  }
  return response
}
