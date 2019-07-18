const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons.js')

exports.max = async (client, dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw createError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    max: {
      max: { field: fieldKey }
    }
  }
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery })
  return esResponse.aggregations.max.value
}

exports.min = async (client, dataset, fieldKey, query) => {
  const field = dataset.schema.find(p => p.key === fieldKey)
  if (!field) throw createError(400, `field "${fieldKey}" is unknown`)
  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    min: {
      min: { field: fieldKey }
    }
  }
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery })
  return esResponse.aggregations.min.value
}
