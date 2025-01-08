
import config from 'config'
import createError from 'http-errors'
import geohash from '../../misc/utils/geohash.js'
import { prepareQuery, getQueryBBOX, aliasName, prepareResultItem } from './commons.js'

export default async (client, dataset, query, publicBaseUrl) => {
  if (!dataset.bbox) throw createError(400, 'geo aggregation cannot be used on this dataset. It is not geolocalized.')
  const bbox = getQueryBBOX(query) || dataset.bbox
  const aggSize = query.agg_size ? Number(query.agg_size) : 20
  if (aggSize > 1000) throw createError(400, '"agg_size" cannot be more than 1000')
  const size = query.size ? Number(query.size) : 1
  if (size > 100) throw createError(400, '"size" cannot be more than 100')
  const precision = geohash.bbox2precision(bbox, aggSize)

  const esQuery = prepareQuery(dataset, query)
  esQuery.size = 0
  esQuery.aggs = {
    geo: {
      geohash_grid: {
        field: '_geopoint',
        precision,
        size: aggSize
      },
      aggs: {
        centroid: { geo_centroid: { field: '_geopoint' } }
      }
    }
  }
  if (size) {
    esQuery.aggs.geo.aggs.topHits = { top_hits: { size, _source: esQuery._source, sort: esQuery.sort } }
  }
  if (query.metric && query.metric_field) {
    esQuery.aggs.geo.aggs.metric = {
      [query.metric]: { field: query.metric_field }
    }
  }
  const esResponse = (await client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  })).body
  return prepareGeoAggResponse(esResponse, dataset, query, publicBaseUrl)
}

const prepareGeoAggResponse = (esResponse, dataset, query, publicBaseUrl) => {
  const response = { total: esResponse.hits.total.value }
  response.aggs = esResponse.aggregations.geo.buckets.map(b => {
    const center = geohash.hash2coord(b.key)
    const aggItem = {
      total: b.doc_count,
      value: b.key,
      centroid: b.centroid.location,
      center: { lat: center[1], lon: center[0] },
      bbox: geohash.hash2bbox(b.key),
      results: b.topHits ? b.topHits.hits.hits.map(hit => prepareResultItem(hit, dataset, query, publicBaseUrl)) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    return aggItem
  })
  return response
}
