// schematize dataset data and try to guess the schém
const dataSample = require('../utils/data-sample')
const fieldsSniffer = require('../utils/fields-sniffer')

exports.type = 'dataset'
exports.eventsPrefix = 'schematize'
exports.filter = { status: 'analyzed', 'file.mimetype': 'text/csv' }

exports.process = async function(app, dataset) {
  const db = app.get('db')

  // get a random sampling to test values type on fewer elements
  const sample = await dataSample(dataset)
  const firstLine = sample.pop()
  // Convert an array of objects to an object of sets
  // Each set will hold the differents values for each field
  const myCSVObject = sample.reduce((acc, current) => {
    // TODO We should not add items to the set if it's size is > 100 or the item's length > 50 (numbers may be tweaked)
    Object.keys(acc).forEach(k => acc[k].add(current[k]))
    return acc
  }, Object.assign({}, ...Object.keys(firstLine).map(k => ({
    [k]: new Set([firstLine[k]])
  }))))
  // Now we can extract infos for each field
  Object.keys(myCSVObject).forEach(field => {
    Object.assign(dataset.file.schema.find(f => f.key === fieldsSniffer.escapeKey(field)), fieldsSniffer.sniff(myCSVObject[field]))
  })

  dataset.schema = dataset.schema || []
  // Remove fields present in the stored schema, when absent from the raw file schema and not coming from extension
  dataset.schema = dataset.schema.filter(field => field['x-extension'] || dataset.file.schema.find(f => f.key === field.key))
  // Add fields not yet present in the stored schema
  dataset.schema = dataset.schema.concat(dataset.file.schema.filter(field => !dataset.schema.find(f => f.key === field.key)))

  if (dataset.hasFiles) {
    dataset.schema.find(field => field.key === 'file').title = `Le chemin du fichier dans l'archive`
    dataset.schema.push({ key: '_file.content', type: 'string', title: `Le contenu textuel extrait du fichier` })
    dataset.schema.push({ key: '_file.content_type', type: 'string', title: `Le type mime du fichier` })
    dataset.schema.push({ key: '_file.content_length', type: 'integer', title: `La taille en octet du fichier` })
  }

  dataset.status = 'schematized'
  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: { status: 'schematized', schema: dataset.schema }
  })
}
