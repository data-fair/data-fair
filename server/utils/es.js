const Writable = require('stream').Writable
const config = require('config')
const elasticsearch = require('elasticsearch')
const createError = require('http-errors')
const geoUtils = require('./geo')
const geohash = require('./geohash')

exports.init = () => elasticsearch.Client(Object.assign({}, config.elasticsearch))

const indexBase = {
  settings: {
    index: {
    // Minimal overhead by default as we might deal with a lot of small indices.
    // TODO: a way to override this ? Maybe intelligently based on size of the file ?
      number_of_shards: 1,
      number_of_replicas: 1
    }
  },
  mappings: {
    line: {}
  }
}

const indexName = exports.indexName = (dataset) => {
  return `${config.indicesPrefix}-${dataset.id}`
}

exports.esType = prop => {
  if (prop.type === 'integer') return 'long'
  if (prop.type === 'number') return 'double'
  if (prop.type === 'boolean') return 'boolean'
  if (prop.type === 'string' && prop.format === 'date-time') return 'date'
  if (prop.type === 'string' && prop.format === 'date') return 'date'
  if (prop.type === 'string' && prop.format === 'uri-reference') return 'keyword'
  return 'text'
}

exports.initDatasetIndex = async (client, dataset, geopoint) => {
  const tempId = `${indexName(dataset)}-${Date.now()}`
  const body = Object.assign({}, indexBase)
  const properties = body.mappings.line.properties = {}

  dataset.schema.forEach(jsProp => {
    properties[jsProp.key] = {type: exports.esType(jsProp)}
  })

  // "hidden" field for geopoint indexing
  if (geopoint) {
    properties['_geopoint'] = {type: 'geo_point'}
  }

  await client.indices.create({index: tempId, body})
  return tempId
}

exports.switchAlias = async (client, dataset, tempId) => {
  const name = indexName(dataset)
  await client.indices.putAlias({name, index: tempId})

  // Delete all other indices from this dataset
  const previousIndices = await client.indices.get({index: `${name}-*`})
  for (let key in previousIndices) {
    if (key !== tempId && key !== name) await client.indices.delete({index: key})
  }
}

class IndexStream extends Writable {
  constructor(client, index, dataset, geopoint) {
    super({objectMode: true})
    this.client = client
    this.index = index
    this.dataset = dataset
    this.geopoint = geopoint
    this.body = []
    this.i = 0
  }
  _write(chunk, encoding, callback) {
    this.body.push({index: {_index: this.index, _type: 'line'}})
    if (this.geopoint) {
      // "hidden" field for geopoint indexing
      chunk._geopoint = geoUtils.getGeopoint(this.dataset.schema, chunk)
    }
    this.body.push(chunk)
    this.i += 1
    if (this.i % 10000 === 0) {
      this._sendBulk(callback)
    } else {
      callback()
    }
  }
  _final(callback) {
    this._sendBulk(callback)
  }
  _sendBulk(callback) {
    if (this.body.length === 0) return callback()
    this.client.bulk({body: this.body, refresh: 'true'}, (err) => {
      if (err) return callback(err)
      // Super weird ! When passing callback directly it seems that it is not called.
      callback()
    })
    this.body = []
  }
}

exports.indexStream = async (client, inputStream, index, dataset, geopoint) => {
  return new Promise((resolve, reject) => {
    const indexStream = new IndexStream(client, index, dataset, geopoint)

    inputStream
      .on('error', reject)
      .pipe(indexStream)
      .on('error', reject)
      .on('finish', () => {
        resolve(indexStream.i)
      })
  })
}

exports.searchInDataset = async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await client.search({index: indexName(dataset), body: esQuery})
  return prepareResponse(esResponse)
}

const prepareResponse = (esResponse) => {
  const response = {}
  response.total = esResponse.hits.total
  response.results = esResponse.hits.hits.map(hit => hit._source)
  return response
}

exports.bboxAgg = async (client, dataset, query = {}) => {
  query.size = '0'
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    bbox: {
      geo_bounds: {
        field: '_geopoint'
      }
    }
  }
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
  query.size = '0'
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
  const esType = exports.esType(prop)
  if (esType === 'text') throw createError(400, 'values aggregation is not permitted on a full text field')

  query.size = '0'
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    card: {
      cardinality: {
        field: query.field
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
      results: b.topHits ? b.topHits.hits.hits.map(hit => hit._source) : []
    }
    if (b.metric) {
      aggItem.metric = b.metric.value
    }
    return aggItem
  })
  return response
}

exports.geoAgg = async (client, dataset, query) => {
  const bbox = query.bbox ? query.bbox.split(',').map(Number) : dataset.bbox
  const aggSize = query.agg_size ? Number(query.agg_size) : 20
  if (aggSize > 1000) throw createError(400, '"agg_size" cannot be more than 1000')
  const size = query.size ? Number(query.size) : 1
  if (size > 100) throw createError(400, '"size" cannot be more than 100')
  const precision = geohash.bbox2precision(bbox, aggSize)

  query.size = '0'
  const esQuery = prepareQuery(dataset, query)
  esQuery.aggs = {
    geo: {
      geohash_grid: {
        field: '_geopoint',
        precision: precision,
        size: aggSize
      },
      aggs: {
        centroid: { geo_centroid: { field: '_geopoint' } },
        topHits: { top_hits: { size, _source: esQuery._source } }
      }
    }
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
      results: b.topHits.hits.hits.map(hit => hit._source)
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
  esQuery._source = query.select ? query.select.split(',') : '*'

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
  if (query.bbox) {
    if (!dataset.bbox) throw createError(400, '"bbox" filter cannot be used on this dataset. It is not geolocalized.')
    const bbox = query.bbox.split(',').map(Number)
    const esBoundingBox = { left: bbox[0], bottom: bbox[1], right: bbox[2], top: bbox[3] }
    filter.push({ geo_bounding_box: { _geopoint: esBoundingBox } })
  }

  esQuery.query = { bool: { filter, must } }
  return esQuery
}
