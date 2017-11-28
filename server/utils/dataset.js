const fs = require('fs')
const path = require('path')
const iconv = require('iconv-lite')
const config = require('config')
const csv = require('csv-parser')

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
}
