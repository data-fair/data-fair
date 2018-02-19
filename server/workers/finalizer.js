// Finalize dataset for publication
const esUtils = require('../utils/es')
const geoUtils = require('../utils/geo')
const extensionsUtils = require('../utils/extensions')

exports.eventsPrefix = 'finalize'

// either extended or there are no extensions to perform
exports.filter = {$or: [
  {status: 'extended'},
  {$and: [
    {status: 'indexed'},
    {extensions: {$not: {$elemMatch: {active: true}}}}
  ]}
]}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')
  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)

  await extensionsUtils.extendCalculated(app, dataset, geopoint)

  const result = {status: 'finalized'}

  if (geopoint) {
    const res = await esUtils.bboxAgg(es, dataset)
    result.bbox = dataset.bbox = res.bbox
  }

  for (const prop of dataset.schema) {
    // no cardinality on text field
    if (prop.type === 'string' && !prop.format) continue
    result.schema = dataset.schema
    const aggResult = await esUtils.valuesAgg(es, dataset, {field: prop.key, agg_size: 10})
    prop['x-cardinality'] = aggResult.total_values
    const firstValue = aggResult.aggs[0]
    if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (aggResult.total_values <= 10) {
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  Object.assign(dataset, result)
  await collection.updateOne({id: dataset.id}, {$set: result})
}
