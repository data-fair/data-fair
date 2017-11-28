// Analyze dataset data and try to guess the schém
const datasetFileSample = require('../utils/dataset-file-sample')
const CSVSniffer = require('csv-sniffer')()
const sniffer = new CSVSniffer()
const iconv = require('iconv-lite')
const countLines = require('../utils/count-lines')
const datasetUtils = require('../utils/dataset')

const analyzeDataset = module.exports = async function(db) {
  const dataset = await db.collection('datasets').findOne({
    status: 'loaded',
    'file.mimetype': 'text/csv'
  })
  const fileSample = await datasetFileSample(dataset)
  const sniffResult = sniffer.sniff(iconv.decode(fileSample, dataset.file.encoding.toLowerCase()))
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
  const numLines = await countLines(datasetUtils.fileName(dataset), sniffResult.newlineStr)
  console.log('numLines', numLines)

  setTimeout(() => analyzeDataset(db), 10000)
}
