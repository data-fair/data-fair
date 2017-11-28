// Analyze dataset data and try to guess the schém
const datasetFileSample = require('../utils/dataset-file-sample')
const CSVSniffer = require('csv-sniffer')()
const sniffer = new CSVSniffer([',', ';', '\t', '|'])
const iconv = require('iconv-lite')
const countLines = require('../utils/count-lines')
const datasetUtils = require('../utils/dataset')
const journals = require('../journals')

const analyzeDataset = async function(db) {
  let dataset = await db.collection('datasets').find({
    status: 'loaded',
    'file.mimetype': 'text/csv'
  }).sort({
    updatedAt: 1
  }).toArray()
  dataset = dataset.pop()
  if (!dataset) return
  await journals.log(db, dataset, {
    type: 'analyze-start'
  })
  const fileSample = await datasetFileSample(dataset)
  const sniffResult = sniffer.sniff(iconv.decode(fileSample, dataset.file.encoding))

  const schema = Object.assign({}, ...sniffResult.labels.map((field, i) => ({
    [field.replace(/\.|\$/g, '_')]: {
      type: sniffResult.types[i],
      'x-originalName': field,
      title: field
    }
  })))
  const props = {
    linesDelimiter: sniffResult.newlineStr,
    fieldsDelimiter: sniffResult.delimiter,
    escapeChar: sniffResult.quoteChar
  }
  props.numLines = await countLines(datasetUtils.fileName(dataset), sniffResult.newlineStr)
  await db.collection('datasets').updateOne({
    id: dataset.id
  }, {
    $set: {
      'file.props': props,
      status: 'analyzed',
      'file.schema': schema
    }
  })
  await journals.log(db, dataset, {
    type: 'analyze-end'
  })
}

module.exports = async function loop(db) {
  await analyzeDataset(db)
  setTimeout(() => loop(db), 1000)
}
