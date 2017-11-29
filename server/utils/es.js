const Transform = require('stream').Transform
const config = require('config')
const elasticsearch = require('elasticsearch')
const createError = require('http-errors')

const client = exports.client = elasticsearch.Client(config.elasticsearch)

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

exports.initDatasetIndex = async (dataset) => {
  const tempId = `${indexName(dataset)}-${Date.now()}`
  const body = Object.assign({}, indexBase)
  const properties = body.mappings.line.properties = {}
  Object.keys(dataset.schema).forEach(key => {
    const jsProp = dataset.schema[key]
    const esProp = properties[key] = {}
    if (jsProp.type === 'integer') esProp.type = 'long'
    else if (jsProp.type === 'number') esProp.type = 'double'
    else if (jsProp.type === 'boolean') esProp.type = 'boolean'
    else if (jsProp.type === 'string' && jsProp.format === 'date-time') esProp.type = 'date'
    else if (jsProp.type === 'string' && jsProp.format === 'date') esProp.type = 'date'
    else if (jsProp.type === 'string' && jsProp.format === 'uri-reference') esProp.type = 'keyword'
    else esProp.type = 'text'
  })
  await client.indices.create({index: tempId, body})
  return tempId
}

exports.switchAlias = async (dataset, tempId) => {
  const name = indexName(dataset)
  await client.indices.putAlias({name, index: tempId})

  // Delete all other indices that from this dataset
  const previousIndices = await client.indices.get({index: `${name}-*`})
  for (let key in previousIndices) {
    if (key !== tempId && key !== name) await client.indices.delete({index: key})
  }
}

class IndexStream extends Transform {
  constructor(index) {
    super({objectMode: true})
    this.index = index
    this.body = []
    this.i = 0
  }
  _transform(chunk, encoding, callback) {
    this.body.push({index: {_index: this.index, _type: 'line'}})
    this.body.push(chunk)
    this.i += 1
    if (this.i % 1000 === 0) {
      this._sendBulk(callback)
    } else {
      callback()
    }
  }
  _flush(callback) {
    this._sendBulk(callback)
  }
  _sendBulk(callback) {
    client.bulk({body: this.body}, callback)
    this.body = []
  }
}

exports.indexStream = async (inputStream, index) => {
  return new Promise((resolve, reject) => {
    const indexStream = new IndexStream(index)

    inputStream
      .on('error', reject)
      .pipe(indexStream)
      .on('error', reject)
      .on('finish', () => {
        setTimeout(() => resolve(indexStream.i), 1000)
      })
  })
}

exports.searchInDataset = async (dataset, query) => {
  const body = prepareQuery(query)
  const esResponse = await client.search({index: indexName(dataset), body})
  return prepareResponse(esResponse)
}

const prepareResponse = (esResponse) => {
  const response = {}
  response.total = esResponse.hits.total
  response.results = esResponse.hits.hits.map(hit => {
    return {
      score: hit._score,
      doc: hit._source
    }
  })
  return response
}

const prepareQuery = query => {
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

  // query and simple query string for a lot a functionalities in a simple exposition (too open ??)
  if (query.qs) {
    must.push({ query_string: { query: query.qs } })
  }
  if (query.q) {
    must.push({ simple_query_string: { query: query.q } })
  }

  esQuery.query = { bool: { filter, must } }

  return esQuery
}
