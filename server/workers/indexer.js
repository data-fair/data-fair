// Index tabular datasets with elasticsearch using available information on dataset schema
const promisePipe = require('promisepipe')
// const datasetUtils = require('../utils/dataset')
const esUtils = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const geoUtils = require('../utils/geo')
const extensionsUtils = require('../utils/extensions')

exports.eventsPrefix = 'index'

exports.filter = {status: 'schematized'}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const tempId = await esUtils.initDatasetIndex(es, dataset, geopoint)
  const indexStream = esUtils.indexStream(es, tempId, dataset)
  await promisePipe(datasetUtils.readStream(dataset), extensionsUtils.extendStream({db, es, dataset}), indexStream)
  const count = dataset.count = indexStream.i

  // Perform all extensions with remote services.
  // the "extendStream" previously used was simply to preserve extensions from previous indexing tasks
  const extensions = dataset.extensions || []
  const extensionsPromises = []
  for (let extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    // TODO: check that owner can use remoteservice event if not owner ?
    if (dataset.owner.type !== remoteService.owner.type || dataset.owner.id !== remoteService.owner.id) continue
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) continue
    extensionsPromises.push(extensionsUtils.extend(app, dataset, extension, remoteService, action, tempId))
  }

  await Promise.all(extensionsPromises)

  await extensionsUtils.extendCalculated(app, tempId, dataset, geopoint)

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
    if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (aggResult.total_values <= 10) {
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  dataset.status = 'indexed'
  await collection.updateOne({id: dataset.id}, updateQuery)
}
