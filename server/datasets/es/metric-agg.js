import createError from 'http-errors'
import moment from 'moment-timezone'
import config from '#config'
import { prepareQuery, aliasName } from './commons.js'
import capabilities from '../../../contract/capabilities.js'

const acceptedMetricAggsByType = {
  number: ['avg', 'sum', 'min', 'max', 'stats', 'value_count', 'percentiles'],
  string: ['min', 'max', 'cardinality', 'value_count'],
  other: ['value_count']
}
/** @type string[] */
export const acceptedMetricAggs = []
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

const cleanValue = (field, metric, value) => {
  if (['min', 'max', 'percentiles'].includes(metric)) {
    if (field.type === 'string' && field.format === 'date') return moment(value).format('YYYY-MM-DD')
    if (field.type === 'string' && field.format === 'date-time') return moment.tz(value, field.timeZone || config.defaultTimeZone).format()
  }
  return value
}

const getValueFromAggRes = (field, metric, aggRes) => {
  if (aggRes.value !== undefined) return cleanValue(field, metric, aggRes.value)
  else if (aggRes.values !== undefined) return aggRes.values.map(v => cleanValue(field, metric, v))
  else return cleanValue(field, metric, aggRes)
}

const getMetricType = (field) => {
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

export const assertMetricAccepted = (field, metric) => {
  const metricType = getMetricType(field)
  const acceptedAggs = acceptedMetricAggsByType[metricType]
  if (!acceptedAggs?.includes(metric)) {
    throw createError(400, `Impossible de calculer une métrique sur le champ ${field.key}. La métrique "${metric}", n'est pas supportée pour ce type de champ.`)
  }
}

export const agg = async (client, dataset, query) => {
  if (!query.metric) throw createError(400, '"metric" parameter is required')
  const metricField = query.field || query.metric_field
  if (!metricField) throw createError(400, '"field" parameter is required')
  const field = dataset.schema.find(f => f.key === metricField)
  if (!field) throw createError(400, `Impossible de calculer une métrique sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
  if (field['x-capabilities'] && field['x-capabilities'].values === false) {
    throw createError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
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
  const esResponse = (await client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })).body
  const response = { total: esResponse.hits.total.value }
  response.metric = getValueFromAggRes(field, query.metric, esResponse.aggregations.metric)
  return response
}

export const simpleMetricsAgg = async (client, dataset, query) => {
  let fields
  if (query.fields) {
    fields = query.fields.split(',')
  } else {
    fields = dataset.schema
      .filter(f => !f['x-capabilities'] || f['x-capabilities'].values !== false)
      .filter(f => !f['x-calculated']).map(f => f.key)
  }

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {}

  let globalMetrics
  if (query.metrics) globalMetrics = query.metrics.split(',')

  for (const metricField of fields) {
    const field = dataset.schema.find(f => f.key === metricField)
    if (!field) throw createError(400, `Impossible de calculer des métriques sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
    if (field['x-capabilities'] && field['x-capabilities'].values === false) {
      throw createError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
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
  const esResponse = (await client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })).body
  const response = { total: esResponse.hits.total.value, metrics: {} }
  for (const metricField of fields) {
    response.metrics[metricField] = {}
    const field = dataset.schema.find(f => f.key === metricField)
    const metrics = globalMetrics ?? defaultMetricAggsByType[getMetricType(field)]
    for (const metric of metrics) {
      response.metrics[metricField][metric] = getValueFromAggRes(field, metric, esResponse.aggregations[metricField + ':' + metric])
    }
  }
  return response
}
