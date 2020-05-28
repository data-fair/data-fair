// Analyze dataset data, check validity and extract a few metadata for next workers
const datasetFileSample = require('../utils/dataset-file-sample')
const csvSniffer = require('../utils/csv-sniffer')

const iconv = require('iconv-lite')
const datasetUtils = require('../utils/dataset')
const fieldsSniffer = require('../utils/fields-sniffer')

exports.eventsPrefix = 'analyze'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:csv-analyzer:${dataset.id}`)
  debug('extract file sample')
  const db = app.get('db')
  const fileSample = await datasetFileSample(dataset)
  if (!fileSample) throw new Error('Échec d\'échantillonage du fichier tabulaire, il est vide')
  let decodedSample
  try {
    decodedSample = iconv.decode(fileSample, dataset.file.encoding)
  } catch (err) {
    throw new Error(`Échec de décodage du fichier selon l'encodage détecté ${dataset.file.encoding}`)
  }
  debug('sniff csv sample')
  const sniffResult = await csvSniffer.sniff(decodedSample)

  const schema = dataset.file.schema = sniffResult.labels
    .map((field, i) => ({
      key: fieldsSniffer.escapeKey(field),
      'x-originalName': field.replace(/""/g, '"').replace(/^"/, '').replace(/"$/, ''),
    }))
    // do not keep columns with empty string as header
    .filter(field => !!field.key)

  const keys = new Set([])
  schema.forEach(field => {
    if (keys.has(field.key)) throw new Error(`Échec de l'analyse du fichier tabulaire, il contient plusieurs fois la colonne "${field.key}".`)
    keys.add(field.key)
  })

  const props = dataset.file.props = {
    linesDelimiter: sniffResult.linesDelimiter,
    fieldsDelimiter: sniffResult.fieldsDelimiter,
    escapeChar: sniffResult.escapeChar,
  }
  debug('count lines')
  props.numLines = await datasetUtils.countLines(dataset)

  debug('store status as analyzed')
  dataset.status = 'analyzed'
  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: {
      'file.props': props,
      status: 'analyzed',
      'file.schema': schema,
    },
  })
}
