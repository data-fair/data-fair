const fs = require('fs')
const path = require('path')
const Combine = require('stream-combiner')
const { Transform } = require('stream')
const iconv = require('iconv-lite')
const config = require('config')
const csv = require('csv-parser')
const JSONStream = require('JSONStream')
const fieldsSniffer = require('./fields-sniffer')

exports.fileName = (dataset) => {
  return path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.file.name.split('.').pop())
}

// Read the dataset file and get a stream of line items
exports.readStream = (dataset) => {
  let parser, transformer
  if (dataset.file.mimetype === 'text/csv') {
    // use result from csv-sniffer to configure parser
    parser = csv({
      separator: dataset.file.props.fieldsDelimiter,
      quote: dataset.file.props.escapeChar,
      newline: dataset.file.props.linesDelimiter
    })
    // reject empty lines (parsing failures from csv-parser)
    transformer = new Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        const hasContent = Object.keys(item).reduce((a, b) => a || item[b] !== undefined, false)
        if (hasContent) callback(null, item)
        else callback()
      }
    })
  } else if (dataset.file.mimetype === 'application/geo+json') {
    parser = JSONStream.parse('features.*')
    // transform geojson features into raw data items
    transformer = new Transform({
      objectMode: true,
      transform(feature, encoding, callback) {
        const item = {...feature.properties}
        if (feature.id) item.id = feature.id
        item.geometry = feature.geometry
        callback(null, item)
      }
    })
  } else {
    throw new Error('Dataset type is not supported ' + dataset.file.mimetype)
  }
  return Combine(
    fs.createReadStream(exports.fileName(dataset)),
    iconv.decodeStream(dataset.file.encoding),
    parser,
    transformer,
    // Fix the objects based on fields sniffing
    new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const line = {}
        dataset.schema.forEach(prop => {
          // console.log(chunk[prop['x-originalName']])
          // console.log(fieldsSniffer.format(chunk[prop['x-originalName']], prop))
          const value = fieldsSniffer.format(chunk[prop['x-originalName']], prop)
          if (value !== null) line[prop.key] = value
        })
        callback(null, line)
      }
    })
  )
}

exports.storageSize = async (db, owner) => {
  const aggQuery = [
    {$match: {'owner.type': owner.type, 'owner.id': owner.id}},
    {$project: {'file.size': 1}},
    {$group: {_id: null, totalSize: {$sum: '$file.size'}}}
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  return res.length ? res[0].totalSize : 0
}

exports.storageRemaining = async (db, owner, req) => {
  const proxyLimit = req.get(config.headers.storedBytesLimit)
  const limit = proxyLimit ? parseInt(proxyLimit) : config.defaultLimits.totalStorage
  if (limit === -1) return -1
  const size = await exports.storageSize(db, owner)
  return Math.max(0, limit - size)
}
