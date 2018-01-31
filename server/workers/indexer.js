// Index tabular datasets with elasticsearch using available information on dataset schema
// const datasetUtils = require('../utils/dataset')
const esUtils = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const geoUtils = require('../utils/geo')

exports.eventsPrefix = 'index'

exports.filter = {status: 'schematized'}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')

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
    if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (aggResult.total_values <= 10) {
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  dataset.status = 'indexed'
  await collection.updateOne({id: dataset.id}, updateQuery)
}
