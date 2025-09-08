import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { prepareQuery, aliasName } from './commons.js'
import es from '#es'

export default async (dataset, query = {}, allowPartialResults = false, timeout = config.elasticsearch.searchTimeout) => {
  if (!dataset.bbox) throw httpError(400, 'geo aggregation cannot be used on this dataset. It is not geolocalized.')

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  // if necessary use corners, not centroid in order to get truly surrounding box
  // and to function even with a single document
  const geoCornersProp = dataset.schema.find(p => p.key === '_geocorners')
  const geoCorners = geoCornersProp && (!geoCornersProp['x-capabilities'] || geoCornersProp['x-capabilities'].geoCorners !== false)
  esQuery.aggs = { bbox: { geo_bounds: { field: geoCorners ? '_geocorners' : '_geopoint' } } }
  const esResponse = await es.client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout,
    allow_partial_search_results: allowPartialResults
  })
  const response = { total: esResponse.hits.total.value }
  // ES bounds to standard bounding box: left,bottom,right,top
  const bounds = esResponse.aggregations.bbox.bounds
  if (!bounds) response.bbox = []
  else response.bbox = [bounds.top_left.lon, bounds.bottom_right.lat, bounds.bottom_right.lon, bounds.top_left.lat]
  return response
}
