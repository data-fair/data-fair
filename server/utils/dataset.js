const fs = require('fs')
const path = require('path')
const { Transform } = require('stream')
const iconv = require('iconv-lite')
const config = require('config')
const csv = require('csv-parser')
const fieldsSniffer = require('./fields-sniffer')

exports.fileName = (dataset) => {
  return path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.file.name.split('.').pop())
}

exports.readStream = (dataset) => {
  return fs.createReadStream(exports.fileName(dataset))
    .pipe(iconv.decodeStream(dataset.file.encoding))
    // TODO: use mime-type to parse other formats
    // use result from csv-sniffer to configure parser
    .pipe(csv({
      separator: dataset.file.props.fieldsDelimiter,
      quote: dataset.file.props.escapeChar,
      newline: dataset.file.props.linesDelimiter
    }))
    // Fix the objects based on fields sniffing
    .pipe(new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const line = {}
        dataset.schema.forEach(prop => {
          const value = fieldsSniffer.format(chunk[prop['x-originalName']], prop)
          if (value !== null) line[prop.key] = value
        })
        callback(null, line)
      }
    }))
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

exports.ownerCount = async (db, owner) => {
  const aggQuery = [
    {$match: {'owner.type': owner.type, 'owner.id': owner.id}},
    {$group: {_id: null, count: {$sum: 1}}}
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  return res.length ? res[0].count : 0
}
