const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons')

exports.acceptedMetricAggs = ['avg', 'sum', 'min', 'max', 'stats', 'cardinality', 'value_count', 'percentiles']

exports.agg = async (client, dataset, query) => {
  if (!query.metric || !query.metric_field) throw createError(400, '"metric" and "metric_field" parameters are required')
  const fields = dataset.schema.map(f => f.key)
  if (!fields.includes(query.metric_field)) throw createError(400, `Impossible d'agréger sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)
  if (!this.acceptedMetricAggs.includes(query.metric)) throw createError(400, `La métrique ${query.metric}, n'est pas supportée.`)

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    metric: {
      [query.metric]: { field: query.metric_field }
    }
  }
  if (query.metric === 'percentiles') {
    esQuery.aggs.metric.percentiles.keyed = false
    if (query.percents) {
      esQuery.aggs.metric.percentiles.percents = query.percents.split(',')
    }
  }
  const esResponse = (await client.search({ index: aliasName(dataset), body: esQuery })).body
  const response = { total: esResponse.hits.total.value }
  if (esResponse.aggregations.metric.value !== undefined) response.metric = esResponse.aggregations.metric.value
  else if (esResponse.aggregations.metric.values !== undefined) response.metric = esResponse.aggregations.metric.values
  else response.metric = esResponse.aggregations.metric
  return response
}
