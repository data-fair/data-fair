const journals = require('../misc/utils/journals')

// Analyze dataset data, check validity and extract a few metadata for next workers
exports.eventsPrefix = 'analyze'

exports.process = async function (app, dataset) {
  const createError = require('http-errors')
  const iconv = require('iconv-lite')
  const datasetFileSample = require('../datasets/utils/file-sample')
  const csvSniffer = require('../misc/utils/csv-sniffer')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const fieldsSniffer = require('../datasets/utils/fields-sniffer')

  const debug = require('debug')(`worker:csv-analyzer:${dataset.id}`)
  debug('extract file sample')
  const fileSample = await datasetFileSample(datasetUtils.filePath(dataset), dataset.file.encoding === 'UTF-8')
  if (!fileSample) throw createError(400, '[noretry] Échec d\'échantillonage du fichier tabulaire, il est vide')
  let decodedSample
  try {
    decodedSample = iconv.decode(fileSample, dataset.file.encoding)
  } catch (err) {
    throw createError(400, `[noretry] Échec de décodage du fichier selon l'encodage détecté ${dataset.file.encoding}`)
  }
  debug('sniff csv sample')
  const sniffResult = await csvSniffer.sniff(decodedSample)

  dataset.file.schema = sniffResult.labels
    .map((field, i) => ({
      key: fieldsSniffer.escapeKey(field, dataset),
      'x-originalName': field.replace(/""/g, '"').replace(/^"/, '').replace(/"$/, '')
    }))
    // do not keep columns with empty string as header
    .filter(field => !!field.key)

  const keys = new Set([])
  for (const field of dataset.file.schema) {
    if (keys.has(field.key)) throw createError(400, `[noretry] Échec de l'analyse du fichier tabulaire, il contient plusieurs fois la colonne "${field.key}".`)
    keys.add(field.key)
  }

  dataset.file.props = {
    linesDelimiter: sniffResult.linesDelimiter,
    fieldsDelimiter: sniffResult.fieldsDelimiter,
    escapeChar: sniffResult.escapeChar,
    quote: sniffResult.quote
  }

  // get a random sampling to test values type on fewer elements
  debug('extract dataset sample')
  const sampleValues = await datasetUtils.sampleValues(dataset)
  debug('list attachments')
  // Now we can extract infos for each field
  const attachments = await datasetUtils.lsAttachments(dataset)
  for (const field of Object.keys(sampleValues)) {
    if (!field) continue // do not keep columns with empty string as header
    const escapedKey = fieldsSniffer.escapeKey(field, dataset)
    const fileField = dataset.file.schema.find(f => f.key === escapedKey)
    if (!fileField) throw createError(400, `[noretry] Champ ${field} présent dans la donnée mais absent de l'analyse initiale du fichier`)
    const existingField = dataset.schema && dataset.schema.find(f => f.key === escapedKey)
    Object.assign(fileField, fieldsSniffer.sniff([...sampleValues[field]], attachments, existingField))
  }
  if (attachments.length && !dataset.file.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    throw createError(400, `[noretry] Vous avez chargé des pièces jointes, mais aucune colonne ne contient les chemins vers ces pièces jointes. Valeurs attendues : ${attachments.slice(0, 3).join(', ')}.`)
  }
  const emptyCols = dataset.file.schema.filter(p => p.type === 'empty')
  if (emptyCols.length) {
    await journals.log(app, dataset, {
      type: 'error',
      data: `le fichier contient une ou plusieurs colonnes vides qui seront ignorées : ${emptyCols.map(c => c['x-originalName' || c.key]).join(', ')}`
    })
  }
  dataset.file.schema = dataset.file.schema.filter(p => p.type !== 'empty')
  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  const patch = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
