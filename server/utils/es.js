const config = require('config')
const elasticsearch = require('elasticsearch')
const createError = require('http-errors')
const flatten = require('flat')
const crypto = require('crypto')
const geohash = require('./geohash')
const tiles = require('./tiles')
const geoUtils = require('../utils/geo')

exports.init = () => elasticsearch.Client(Object.assign({}, config.elasticsearch))

const indexBase = {
  // Minimal overhead by default as we might deal with a lot of small indices.
  // TODO: a way to override this ? Maybe intelligently based on size of the file ?
  settings: {index: {number_of_shards: 1, number_of_replicas: 1}},
  mappings: {line: {}}
}

const indexName = exports.indexName = dataset => `${config.indicesPrefix}-${dataset.id}`

exports.esProperty = prop => {
  if (prop.type === 'object') return {type: 'object'}
  if (prop.type === 'integer') return {type: 'long'}
  if (prop.type === 'number') return {type: 'double'}
  if (prop.type === 'boolean') return {type: 'boolean'}
  if (prop.type === 'string' && prop.format === 'date-time') return {type: 'date'}
  if (prop.type === 'string' && prop.format === 'date') return {type: 'date'}
  // uri-reference and full text fields are managed in the same way from now on, because we want to be able to aggregate on small full text fields
  // TODO: maybe ignore_above should be only for uri-reference fields
  const textField = {type: 'keyword', ignore_above: 200, fields: {text: {type: 'text', analyzer: config.elasticsearch.defaultAnalyzer}}}
  if (prop.type === 'string' && prop.format === 'uri-reference') return textField
  return textField
}
exports.indexDefinition = (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase))

  const properties = body.mappings.line.properties = {}
  dataset.schema.forEach(jsProp => {
    if (jsProp.key) {
      properties[jsProp.key] = exports.esProperty(jsProp)
      // Do not index geometry, it will copied and simplified in _geoshape
      if (jsProp['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') properties[jsProp.key].index = false
    }
  })

  // "hidden" fields for geo indexing (lat/lon in dataset or geojson data type)
  // console.log(dataset.file)
  if (geoUtils.schemaHasGeopoint(dataset.schema) || geoUtils.schemaHasGeometry(dataset.schema)) {
    properties['_geopoint'] = {type: 'geo_point'}
    properties['_geoshape'] = {type: 'geo_shape'}
    properties['_geocorners'] = {type: 'geo_point'}
  }
  properties['_rand'] = {type: 'integer'}
  return body
}

function indexPrefix(dataset) {
  return `${indexName(dataset)}-${crypto.createHash('sha1').update(dataset.id).digest('hex').slice(0, 12)}`
}

exports.initDatasetIndex = async (client, dataset) => {
  const tempId = `${indexPrefix(dataset)}-${Date.now()}`
  const body = exports.indexDefinition(dataset)
  await client.indices.create({index: tempId, body})
  return tempId
}

exports.delete = async (client, dataset) => {
  await client.indices.deleteAlias({name: indexName(dataset), index: '_all'})
  await client.indices.delete({index: `${indexPrefix(dataset)}-*`})
}

exports.switchAlias = async (client, dataset, tempId) => {
  const name = indexName(dataset)
  // Delete all other indices from this dataset
  const previousIndices = await client.indices.get({index: `${indexPrefix(dataset)}-*`})
  for (let key in previousIndices) {
    if (key !== tempId) await client.indices.delete({index: key})
  }
  await client.indices.deleteAlias({name, index: '_all', ignore: [404]})
  await client.indices.delete({index: name, ignore: [404]})
  await client.indices.putAlias({name, index: tempId})
}

exports.searchInDataset = async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  return esResponse
}

exports.bboxAgg = async (client, dataset, query = {}) => {
  query.size = '0'
  const esQuery = prepareQuery(dataset, query)
  // Use corners, not centroid in order to get truly surrounding box
  // and to function even with a single document
  esQuery.aggs = {bbox: {geo_bounds: {field: '_geocorners'}}}
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  const response = {total: esResponse.hits.total}
  // ES bounds to standard bounding box: left,bottom,right,top
  const bounds = esResponse.aggregations.bbox.bounds
  if (!bounds) response.bbox = []
  else response.bbox = [bounds.top_left.lon, bounds.bottom_right.lat, bounds.bottom_right.lon, bounds.top_left.lat]
  return response
}

exports.metricAgg = async (client, dataset, query) => {
  if (!query.metric || !query.metric_field) throw createError(400, '"metric" and "metric_field" parameters are required')
  query.size = 0
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    metric: {
      [query.metric]: {field: query.metric_field}
    }
  }
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  return {total: esResponse.hits.total, metric: esResponse.aggregations.metric.value}
}

exports.valuesAgg = async (client, dataset, query) => {
  const aggSize = query.agg_size ? Number(query.agg_size) : 20
  if (aggSize > 1000) throw createError(400, '"agg_size" cannot be more than 1000')
  const size = query.size ? Number(query.size) : 0
  if (size > 100) throw createError(400, '"size" cannot be more than 100')
  if (!query.field) throw createError(400, '"field" parameter is required')
  const prop = dataset.schema.find(p => p.key === query.field)
  if (!prop) throw createError(400, '"field" parameter references an unknown field')
  const esType = exports.esProperty(prop).type
  if (esType === 'text') throw createError(400, 'values aggregation is not permitted on a full text field')

  query.size = '0'
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    card: {
      cardinality: {
        field: query.field,
        precision_threshold: 40000
      }
    },
    values: {
      terms: {
        field: query.field,
        size: aggSize
      }
    }
  }
  if (size) {
    esQuery.aggs.values.aggs = {
      topHits: { top_hits: { size, _source: esQuery._source } }
    }
  }
  if (query.metric && query.metric_field) {
    esQuery.aggs.values.terms.order = { metric: 'desc' }
    esQuery.aggs.values.aggs = esQuery.aggs.values.aggs || {}
    esQuery.aggs.values.aggs.metric = {
      [query.metric]: {field: query.metric_field}
    }
  }
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  return prepareValuesAggResponse(esResponse)
}

const prepareValuesAggResponse = (esResponse) => {
  const response = {
    total: esResponse.hits.total,
    total_values: esResponse.aggregations.card.value,
    total_other: esResponse.aggregations.values.sum_other_doc_count
  }
  response.aggs = esResponse.aggregations.values.buckets.map(b => {
    const aggItem = {
      total: b.doc_count,
      value: b.key,
      results: b.topHits ? b.topHits.hits.hits.map(hit => flatten(hit._source)) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    return aggItem
  })
  return response
}

exports.geoAgg = async (client, dataset, query) => {
  if (!dataset.bbox) throw createError(400, 'geo aggregation cannot be used on this dataset. It is not geolocalized.')
  const bbox = getQueryBBOX(query) || dataset.bbox
  const aggSize = query.agg_size ? Number(query.agg_size) : 20
  if (aggSize > 1000) throw createError(400, '"agg_size" cannot be more than 1000')
  const size = query.size ? Number(query.size) : 1
  if (size > 100) throw createError(400, '"size" cannot be more than 100')
  const precision = geohash.bbox2precision(bbox, aggSize)

  query.size = 0
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    geo: {
      geohash_grid: {
        field: '_geopoint',
        precision,
        size: aggSize
      },
      aggs: {
        centroid: {geo_centroid: { field: '_geopoint' }}
      }
    }
  }
  if (size) {
    esQuery.aggs.geo.aggs.topHits = {top_hits: { size, _source: esQuery._source }}
  }
  if (query.metric && query.metric_field) {
    esQuery.aggs.geo.aggs.metric = {
      [query.metric]: {field: query.metric_field}
    }
  }
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  return prepareGeoAggResponse(esResponse)
}

const prepareGeoAggResponse = (esResponse) => {
  const response = {total: esResponse.hits.total}
  response.aggs = esResponse.aggregations.geo.buckets.map(b => {
    const center = geohash.hash2coord(b.key)
    const aggItem = {
      total: b.doc_count,
      centroid: b.centroid.location,
      center: {lat: center[1], lon: center[0]},
      bbox: geohash.hash2bbox(b.key),
      results: b.topHits ? b.topHits.hits.hits.map(hit => flatten(hit._source)) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    return aggItem
  })
  return response
}

const prepareQuery = (dataset, query) => {
  const esQuery = {}

  // Pagination
  esQuery.size = query.size ? Number(query.size) : 20
  if (query.size > 10000) throw createError(400, '"size" cannot be more than 10000')
  esQuery.from = (query.page ? Number(query.page) - 1 : 0) * esQuery.size

  // Select fields to return
  esQuery._source = {includes: query.select ? query.select.split(',') : ['*'], excludes: []};

  // Some fields are excluded, unless explicitly included
  ['_geoshape', '_geopoint', '_geocorners', '_rand'].forEach(f => {
    if (!esQuery._source.includes.includes(f)) esQuery._source.excludes.push(f)
  })

  // Sort by list of fields (prefixed by - for descending sort)
  if (query.sort) {
    esQuery.sort = query.sort.split(',').map(s => {
      if (s.indexOf('-') === 0) return { [s.slice(1)]: 'desc' }
      else return { [s]: 'asc' }
    })
  } else {
    esQuery.sort = []
  }
  // Also implicitly sort by score
  esQuery.sort.push('_score')
  // And lastly random order for natural distribution (mostly important for geo results)
  esQuery.sort.push('_rand')

  const filter = []
  const must = []

  // query and simple query string for a lot of functionalities in a simple exposition (too open ??)
  if (query.qs) {
    must.push({ query_string: { query: query.qs } })
  }
  if (query.q) {
    must.push({ simple_query_string: { query: query.q } })
  }

  // bounding box filter to restrict results on geo zone: left,bottom,right,top
  if (query.bbox || query.xyz) {
    if (!dataset.bbox) throw createError(400, '"bbox" filter cannot be used on this dataset. It is not geolocalized.')
    const bbox = getQueryBBOX(query, dataset)
    const esBoundingBox = { left: bbox[0], bottom: bbox[1], right: bbox[2], top: bbox[3] }
    // use geo_shape intersection instead geo_bounding_box in order to get even
    // partial geometries in tiles
    filter.push({geo_shape: {_geoshape: {
      relation: 'intersects',
      shape: {
        type: 'envelope',
        coordinates: [[esBoundingBox.left, esBoundingBox.top], [esBoundingBox.right, esBoundingBox.bottom]]
      }
    }}})
  }

  esQuery.query = { bool: { filter, must } }

  return esQuery
}

const getQueryBBOX = (query) => {
  let bbox
  if (query.bbox) {
    bbox = query.bbox.split(',').map(Number)
  } else if (query.xyz) {
    bbox = tiles.xyz2bbox(...query.xyz.split(',').map(Number))
  }
  return bbox
}
