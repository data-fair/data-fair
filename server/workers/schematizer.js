// schematize dataset data and try to guess the schém
const journals = require('../utils/journals')
const dataSample = require('../utils/data-sample')
const fieldsSniffer = require('../utils/fields-sniffer')
const config = require('config')

// A hook/spy for testing purposes
let resolveHook, rejectHook, stopResolve
exports.hook = function() {
  return new Promise((resolve, reject) => {
    resolveHook = resolve
    rejectHook = reject
  })
}

exports.loop = async function loop(app) {
  if (stopResolve) return stopResolve()
  try {
    const dataset = await schematizeDataset(app)
    if (dataset && resolveHook) resolveHook(dataset)
  } catch (err) {
    console.error(err)
    if (rejectHook) rejectHook(err)
  }

  setTimeout(() => loop(app), config.workersPollingIntervall)
}

exports.stop = () => {
  return new Promise(resolve => { stopResolve = resolve })
}

const schematizeDataset = async function(app) {
  const db = app.get('db')
  const datasets = await db.collection('datasets').find({
    status: 'analyzed',
    'file.mimetype': 'text/csv'
  }).limit(1).sort({
    updatedAt: -1
  }).toArray()
  const dataset = datasets.pop()
  if (!dataset) return

  await journals.log(app, dataset, {type: 'schematize-start'})

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
  dataset.schema = previousSchema.concat(dataset.file.schema.filter(field => !previousSchema.find(f => f.key === field.key)))

  dataset.status = 'schematized'
  await db.collection('datasets').updateOne({
    id: dataset.id
  }, {
    $set: {
      status: 'schematized',
      schema: dataset.schema
    }
  })

  await journals.log(app, dataset, {type: 'schematize-end'})

  return dataset
}
