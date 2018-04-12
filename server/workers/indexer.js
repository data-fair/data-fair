// Index tabular datasets with elasticsearch using available information on dataset schema
const promisePipe = require('promisepipe')
const esUtils = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const extensionsUtils = require('../utils/extensions')

exports.eventsPrefix = 'index'

exports.filter = {status: 'schematized'}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')

  const tempId = await esUtils.initDatasetIndex(es, dataset)
  const indexStream = esUtils.indexStream(es, tempId, dataset)
  // reindex and preserve previous extensions
  await promisePipe(datasetUtils.readStream(dataset), extensionsUtils.extendStream({db, es, dataset}), indexStream)
  const count = dataset.count = indexStream.i

  await esUtils.switchAlias(es, dataset, tempId)

  const result = {status: 'indexed', count}
  Object.assign(dataset, result)
  await collection.updateOne({id: dataset.id}, {$set: result})
}
