const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons')

module.exports = async (client, dataset, query) => {
  if (!query.metric || !query.metric_field) throw createError(400, '"metric" and "metric_field" parameters are required')
  query.size = 0
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    metric: {
      [query.metric]: { field: query.metric_field }
    }
  }
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery })
  return { total: esResponse.hits.total, metric: esResponse.aggregations.metric.value }
}
