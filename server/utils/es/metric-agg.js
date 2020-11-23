const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons')

module.exports = async (client, dataset, query) => {
  if (!query.metric || !query.metric_field) throw createError(400, '"metric" and "metric_field" parameters are required')
  const fields = dataset.schema.map(f => f.key)
  if (!fields.includes(query.metric_field)) throw createError(400, `Impossible d'agréger sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    metric: {
      [query.metric]: { field: query.metric_field },
    },
  }
  const esResponse = (await client.search({ index: aliasName(dataset), body: esQuery })).body
  return { total: esResponse.hits.total.value, metric: esResponse.aggregations.metric.value }
}
