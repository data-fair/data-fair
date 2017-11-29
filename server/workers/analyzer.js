// Analyze dataset data and try to guess the schém
const datasetFileSample = require('../utils/dataset-file-sample')
const CSVSniffer = require('csv-sniffer')()
const sniffer = new CSVSniffer([',', ';', '\t', '|'])
const iconv = require('iconv-lite')
const countLines = require('../utils/count-lines')
const datasetUtils = require('../utils/dataset')
const journals = require('../journals')

// A hook/spy for testing purposes
let resolveHook, rejectHook
exports.hook = function() {
  return new Promise((resolve, reject) => {
    resolveHook = resolve
    rejectHook = reject
  })
}

exports.loop = async function loop(db) {
  try {
    const dataset = await analyzeDataset(db)
    if (dataset && resolveHook) resolveHook(dataset)
  } catch (err) {
    console.error(err)
    if (rejectHook) rejectHook(err)
  }

  setTimeout(() => loop(db), 1000)
}

const analyzeDataset = async function(db) {
  let dataset = await db.collection('datasets').find({
    status: 'loaded',
    'file.mimetype': 'text/csv'
  }).limit(1).sort({updatedAt: 1}).toArray()
  dataset = dataset.pop()
  if (!dataset) return

  await journals.log(db, dataset, {type: 'analyze-start'})

  const fileSample = await datasetFileSample(dataset)
  const sniffResult = sniffer.sniff(iconv.decode(fileSample, dataset.file.encoding), {hasHeader: true})
  const schema = dataset.file.schema = Object.assign({}, ...sniffResult.labels.map((field, i) => ({
    [field.replace(/\.|\$/g, '_')]: {
      type: sniffResult.types[i],
      'x-originalName': field
    }
  })))
  const props = dataset.file.props = {
    linesDelimiter: sniffResult.newlineStr,
    fieldsDelimiter: sniffResult.delimiter,
    escapeChar: sniffResult.quoteChar || '"'
  }
  props.numLines = await countLines(datasetUtils.fileName(dataset), sniffResult.newlineStr)

  dataset.status = 'analyzed'
  await db.collection('datasets').updateOne({id: dataset.id}, {
    $set: {
      'file.props': props,
      status: 'analyzed',
      'file.schema': schema
    }
  })

  await journals.log(db, dataset, {type: 'analyze-end'})

  return dataset
}
