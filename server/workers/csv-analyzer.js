// Analyze dataset data, check validity and extract a few metadata for next workers
const datasetFileSample = require('../utils/dataset-file-sample')
const CSVSniffer = require('csv-sniffer')()
const possibleDelimiters = [',', ';', '\t', '|']
const sniffer = new CSVSniffer(possibleDelimiters)
const iconv = require('iconv-lite')
const countLines = require('../utils/count-lines')
const datasetUtils = require('../utils/dataset')
const fieldsSniffer = require('../utils/fields-sniffer')

exports.eventsPrefix = 'analyze'

exports.filter = {status: 'loaded', 'file.mimetype': 'text/csv'}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const fileSample = await datasetFileSample(dataset)
  const sniffResult = sniffer.sniff(iconv.decode(fileSample, dataset.file.encoding), {
    hasHeader: true
  })

  // Try to manage csv sniffing failures
  if (sniffResult.delimiter === null && sniffResult.labels && sniffResult.labels && sniffResult.labels[0]) {
    const hasDelimiter = possibleDelimiters.reduce((a, delim) => { return a || sniffResult.labels[0].indexOf(delim) !== -1 }, false)
    if (hasDelimiter) throw new Error('Échec de l\'analyse du fichier, le CSV est probablement mal formé.')
  }

  const schema = dataset.file.schema = sniffResult.labels
    .map((field, i) => ({
      key: fieldsSniffer.escapeKey(field),
      type: sniffResult.types[i],
      'x-originalName': field
    }))
    // do not keep columns with empty string as header
    .filter(field => !!field.key)

  const keys = new Set([])
  schema.forEach(field => {
    if (keys.has(field.key)) throw new Error(`Échec de l'analyse du fichier, le CSV contient plusieurs fois la colonne "${field.key}".`)
    keys.add(field.key)
  })

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
}
