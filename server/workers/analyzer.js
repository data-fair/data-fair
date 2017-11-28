// Analyze dataset data and try to guess the schém
const datasetFileSample = require('../utils/dataset-file-sample')
const CSVSniffer = require('csv-sniffer')()
const sniffer = new CSVSniffer()
const iconv = require('iconv-lite')
const countLines = require('../utils/count-lines')
const datasetUtils = require('../utils/dataset')
const journals = require('../journals')

const analyzeDataset = module.exports = async function(db) {
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
  // Results :
  // {
  //   warnings: [],
  //   newlineStr: '\r\n',
  //   delimiter: ',',
  //   quoteChar: null,
  //   hasHeader: true,
  //   types: ['string','integer', ... ],
  //   labels: ['Voie ou lieu-dit','field_2', ... ]
  // }

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
      status: 'analyzed'
    }
  })
  await journals.log(db, dataset, {
    type: 'analyze-end'
  })
}

module.exports = async function loop(db) {
  await analyzeDataset(db)
  setTimeout(() => analyzeDataset(db), 1000)
}
