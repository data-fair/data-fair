// schematize dataset data and try to guess the schém
const datasetUtils = require('../utils/dataset')
const fieldsSniffer = require('../utils/fields-sniffer')

exports.eventsPrefix = 'schematize'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:csv-schematizer:${dataset.id}`)
  const db = app.get('db')

  // get a random sampling to test values type on fewer elements
  debug('extract dataset sample')
  const sampleValues = await datasetUtils.sampleValues(dataset)
  debug('list attachments')
  // Now we can extract infos for each field
  const attachments = await datasetUtils.lsAttachments(dataset)
  Object.keys(sampleValues)
    // do not keep columns with empty string as header
    .filter(field => !!field)
    .forEach(field => {
      const escapedKey = fieldsSniffer.escapeKey(field)
      const fileField = dataset.file.schema.find(f => f.key === escapedKey)
      if (!fileField) throw new Error(`Champ ${field} présent dans la donnée mais absent de l'analyse initiale du fichier`)
      const existingField = dataset.schema && dataset.schema.find(f => f.key === escapedKey)
      Object.assign(fileField, fieldsSniffer.sniff(sampleValues[field], attachments, existingField))
    })
  if (attachments.length && !dataset.file.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    throw new Error(`Vous avez chargé des pièces jointes, mais aucune colonne ne contient les chemins vers ces pièces jointes. Valeurs attendues : ${attachments.slice(0, 3).join(', ')}.`)
  }

  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  debug('store status as schematized')
  dataset.status = 'schematized'
  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: { status: 'schematized', schema: dataset.schema, file: dataset.file },
  })
}
