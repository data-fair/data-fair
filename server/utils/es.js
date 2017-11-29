const Transform = require('stream').Transform
const config = require('config')
const elasticsearch = require('elasticsearch')

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

exports.initDatasetIndex = async (dataset) => {
  const tempId = `${config.indicesPrefix}-${dataset._id}-${Date.now()}`
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
  const name = `${config.indicesPrefix}-${dataset._id}`
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
      .on('finish', () => resolve(indexStream.i))
  })
}

exports.searchInDataset = async (dataset, query) => {
  const result = client.search({index: `${config.indicesPrefix}-${dataset._id}`, body: {}})
  return result
}
