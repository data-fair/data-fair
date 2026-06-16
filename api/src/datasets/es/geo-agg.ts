import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import geohash from '../../misc/utils/geohash.ts'
import { prepareQuery, getQueryBBOX, aliasName, prepareResultItem, prepareResultContext } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import capabilities from '../../../contract/capabilities.js'
import { columnOperationsHint } from './operations.ts'
import { assertMetricAccepted } from './metric-agg.ts'
import { type Client } from '@elastic/elasticsearch'

export default async (client: Client, dataset: any, query: Record<string, any>, publicBaseUrl: string, flatten: any, abortContext?: EsAbortContext) => {
  if (!dataset.bbox) throw httpError(400, 'geo aggregation cannot be used on this dataset. It is not geolocalized.')
  const bbox = getQueryBBOX(query) || dataset.bbox
  const aggSize = query.agg_size ? Number(query.agg_size) : 20
  if (aggSize > 1000) throw httpError(400, '"agg_size" cannot be more than 1000')
  const size = query.size ? Number(query.size) : 1
  if (size > 100) throw httpError(400, '"size" cannot be more than 100')
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
    const metricField = dataset.schema.find(f => f.key === query.metric_field)
    if (!metricField) throw httpError(400, `Impossible de calculer une métrique sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)
    if (metricField['x-capabilities'] && metricField['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de calculer une métrique sur le champ ${query.metric_field}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(metricField)}`)
    }
    assertMetricAccepted(metricField, query.metric)
    esQuery.aggs.geo.aggs.metric = {
      [query.metric]: { field: query.metric_field }
    }
  }
  const esResponse: any = await timedEsCall(abortContext, () => client.search({
    index: aliasName(dataset),
    body: esQuery,
    timeout: config.elasticsearch.searchTimeout,
    allow_partial_search_results: false
  }, abortContext))
  return prepareGeoAggResponse(esResponse, dataset, query, publicBaseUrl, flatten)
}

const prepareGeoAggResponse = (esResponse: any, dataset: any, query: Record<string, any>, publicBaseUrl: string, flatten: any) => {
  const response: any = { total: esResponse.hits.total.value }
  const resultCtx = prepareResultContext(dataset, query)
  response.aggs = esResponse.aggregations.geo.buckets.map((b: any) => {
    const center = geohash.hash2coord(b.key)
    const aggItem: any = {
      total: b.doc_count,
      value: b.key,
      centroid: b.centroid.location,
      center: { lat: center[1], lon: center[0] },
      bbox: geohash.hash2bbox(b.key),
      results: b.topHits ? b.topHits.hits.hits.map((hit: any) => prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx)) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    return aggItem
  })
  return response
}
