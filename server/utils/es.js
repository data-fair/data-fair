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
    },
    mappings: {
      line: {
      // TODO: json-schema -> ES mapping transformation
        properties: {}
      }
    }
  }
}

exports.initDatasetIndex = async (dataset) => {
  const tempId = `dataset-${dataset._id}-${Date.now()}`
  await client.indices.create({index: tempId, body: Object.assign({}, indexBase)})
  return tempId
}

exports.switchAlias = async (dataset, tempId) => {
  const name = `dataset-${dataset._id}`
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
