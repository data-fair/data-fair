// Index tabular datasets with elasticsearch using available information on dataset schema
// const datasetUtils = require('../utils/dataset')
const esUtils = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const journals = require('../journals')
const geoUtils = require('../utils/geo')
const config = require('config')

// A hook/spy for testing purposes
let resolveHook, rejectHook
exports.hook = function() {
  return new Promise((resolve, reject) => {
    resolveHook = resolve
    rejectHook = reject
  })
}

exports.loop = async function loop(db, es) {
  try {
    const dataset = await indexDataset(db, es)
    if (dataset && resolveHook) resolveHook(dataset)
  } catch (err) {
    console.error(err)
    if (rejectHook) rejectHook(err)
  }

  setTimeout(() => loop(db, es), config.workersPollingIntervall)
}

async function indexDataset(db, es) {
  const collection = db.collection('datasets')
  const datasets = await collection.find({status: 'schematized'}).limit(1).sort({updatedAt: 1}).toArray()
  const dataset = datasets.pop()
  if (!dataset) return

  await journals.log(db, dataset, {type: 'index-start'})

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const tempId = await esUtils.initDatasetIndex(dataset, geopoint)
  const count = dataset.count = await esUtils.indexStream(datasetUtils.readStream(dataset), tempId, dataset, geopoint)
  await esUtils.switchAlias(dataset, tempId)
  const updateQuery = {$set: {status: 'indexed', count}}

  if (geopoint) {
    const res = await esUtils.bboxAgg(dataset)
    updateQuery.$set.bbox = dataset.bbox = res.bbox
  }

  for (const prop of dataset.schema) {
    // no cardinality on text field
    if (prop.type === 'string' && !prop.format) continue
    updateQuery.$set.schema = dataset.schema
    const aggResult = await esUtils.valuesAgg(dataset, {field: prop.key, agg_size: 10})
    prop['x-cardinality'] = aggResult.total_values
    if (aggResult.total_values <= 10) {
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  dataset.status = 'indexed'
  await collection.updateOne({id: dataset.id}, updateQuery)

  await journals.log(db, dataset, {type: 'index-end'})

  return dataset
}
