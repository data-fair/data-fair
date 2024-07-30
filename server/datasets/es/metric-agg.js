const createError = require('http-errors')
const moment = require('moment-timezone')
const config = require('config')
const { prepareQuery, aliasName } = require('./commons')

const acceptedMetricAggsByType = {
  number: ['avg', 'sum', 'min', 'max', 'stats', 'value_count', 'percentiles'],
  string: ['min', 'max', 'cardinality', 'value_count'],
  other: ['value_count']
}
const defaultMetricAggsByType = {
  number: ['min', 'max'],
  string: ['cardinality'],
  other: []
}
exports.acceptedMetricAggs = []
for (const type in acceptedMetricAggsByType) {
  for (const metric of acceptedMetricAggsByType[type]) {
    if (!exports.acceptedMetricAggs.includes(metric)) exports.acceptedMetricAggs.push(metric)
  }
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

exports.agg = async (client, dataset, query) => {
  if (!query.metric) throw createError(400, '"metric" parameter is required')
  const metricField = query.field || query.metric_field
  if (!metricField) throw createError(400, '"field" parameter is required')
  const field = dataset.schema.find(f => f.key === metricField)
  if (!field) throw createError(400, `Impossible de calculer une métrique sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
  if (field['x-capabilities'] && field['x-capabilities'].values === false) {
    throw createError(400, `Impossible de calculer des métriques sur le champ ${metricField}, la fonctionnalité a été désactivée.`)
  }
  const metricType = getMetricType(field)
  const acceptedAggs = acceptedMetricAggsByType[metricType]
  if (!acceptedAggs.includes(query.metric)) throw createError(400, `La métrique ${query.metric}, n'est pas supportée pour ce type de champ.`)

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

exports.simpleMetricsAgg = async (client, dataset, query) => {
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
  for (const metricField of fields) {
    const field = dataset.schema.find(f => f.key === metricField)
    if (!field) throw createError(400, `Impossible de calculer des métriques sur le champ ${metricField}, il n'existe pas dans le jeu de données.`)
    if (field['x-capabilities'] && field['x-capabilities'].values === false) {
      throw createError(400, `Impossible de calculer des métriques sur le champ ${metricField}, la fonctionnalité a été désactivée.`)
    }
    for (const metric of defaultMetricAggsByType[getMetricType(field)]) {
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
    for (const metric of defaultMetricAggsByType[getMetricType(field)]) {
      response.metrics[metricField][metric] = getValueFromAggRes(field, metric, esResponse.aggregations[metricField + ':' + metric])
    }
  }
  return response
}
