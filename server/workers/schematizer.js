// schematize dataset data and try to guess the schém
const dataSample = require('../utils/data-sample')
const fieldsSniffer = require('../utils/fields-sniffer')

exports.eventsPrefix = 'schematize'

exports.filter = {status: 'analyzed', 'file.mimetype': 'text/csv'}

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

  // We copy fields in the detected schema that have not been modified by the user
  const previousSchema = dataset.schema || []
  dataset.schema = previousSchema.concat(dataset.file.schema.filter(field => field.key && !previousSchema.find(f => f.key === field.key)))
  dataset.status = 'schematized'
  await db.collection('datasets').updateOne({id: dataset.id}, {
    $set: {
      status: 'schematized',
      schema: dataset.schema
    }
  })
}
