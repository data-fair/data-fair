// Index tabular datasets with elasticsearch using available information on dataset schema
// const datasetUtils = require('../utils/dataset')
const esUtils = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const journals = require('../utils/journals')
const geoUtils = require('../utils/geo')
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
    const dataset = await indexDataset(app)
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

async function indexDataset(app) {
  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')
  const datasets = await collection.find({status: 'schematized'}).limit(1).sort({updatedAt: 1}).toArray()
  const dataset = datasets.pop()
  if (!dataset) return

  await journals.log(app, dataset, {type: 'index-start'})

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const tempId = await esUtils.initDatasetIndex(es, dataset, geopoint)
  const count = dataset.count = await esUtils.indexStream(es, datasetUtils.readStream(dataset), tempId, dataset, geopoint)
  await esUtils.switchAlias(es, dataset, tempId)
  const updateQuery = {$set: {status: 'indexed', count}}

  if (geopoint) {
    const res = await esUtils.bboxAgg(es, dataset)
    updateQuery.$set.bbox = dataset.bbox = res.bbox
  }

  for (const prop of dataset.schema) {
    // no cardinality on text field
    if (prop.type === 'string' && !prop.format) continue
    updateQuery.$set.schema = dataset.schema
    const aggResult = await esUtils.valuesAgg(es, dataset, {field: prop.key, agg_size: 10})
    prop['x-cardinality'] = aggResult.total_values
    const firstValue = aggResult.aggs[0]
    if (firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (aggResult.total_values <= 10) {
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  dataset.status = 'indexed'
  await collection.updateOne({id: dataset.id}, updateQuery)

  await journals.log(app, dataset, {type: 'index-end'})

  return dataset
}
