const createError = require('http-errors')
const { prepareQuery, aliasName } = require('./commons')

module.exports = async (client, dataset, query = {}) => {
  if (!dataset.bbox) throw createError(400, 'geo aggregation cannot be used on this dataset. It is not geolocalized.')

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  // Use corners, not centroid in order to get truly surrounding box
  // and to function even with a single document
  esQuery.aggs = { bbox: { geo_bounds: { field: '_geocorners' } } }
  const esResponse = await client.search({ index: aliasName(dataset), body: esQuery })
  const response = { total: esResponse.hits.total.value }
  // ES bounds to standard bounding box: left,bottom,right,top
  const bounds = esResponse.aggregations.bbox.bounds
  if (!bounds) response.bbox = []
  else response.bbox = [bounds.top_left.lon, bounds.bottom_right.lat, bounds.bottom_right.lon, bounds.top_left.lat]
  return response
}
