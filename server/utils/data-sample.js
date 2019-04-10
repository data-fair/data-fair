const fs = require('fs')
const csv = require('csv-parser')
const util = require('util')
const shuffle = require('shuffle-array')
const datasetUtils = require('./dataset')
const iconv = require('iconv-lite')

const countLines = (dataset, callback) => {
  const linesNumber = [...Array(dataset.file.props.numLines - 1).keys()]
  shuffle(linesNumber)
  const sampleLineNumbers = new Set(linesNumber.slice(0, Math.min(dataset.file.props.numLines - 1, 4000)))
  const sample = []
  let readError
  let currentLine = 0
  fs.createReadStream(datasetUtils.fileName(dataset))
    .pipe(iconv.decodeStream(dataset.file.encoding))
    .pipe(csv({
      separator: dataset.file.props.fieldsDelimiter,
      quote: dataset.file.props.escapeChar,
      newline: dataset.file.props.linesDelimiter
    }))
    .on('data', (line) => {
      if (sampleLineNumbers.has(currentLine)) sample.push(line)
      currentLine++
    })
    .on('end', () => {
      if (readError) {
        return
      }
      callback(null, sample)
    })
    .on('error', (error) => {
      readError = true
      callback(error)
    })
}

module.exports = util.promisify(countLines)
