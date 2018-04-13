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
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  // Calculate fields after indexing and extension as we might depend on all fields
  await extensionsUtils.extendCalculated(app, dataset, geopoint, geometry)

  const result = {status: 'finalized'}

  let bboxPromise
  if (geopoint || geometry) {
    bboxPromise = esUtils.bboxAgg(es, dataset)
  }

  const nonTextProps = dataset.schema.filter(prop => prop.type !== 'string' || prop.format)
  if (nonTextProps.length) {
    result.schema = dataset.schema
    const responses = await Promise.all(nonTextProps.map(p => esUtils.valuesAgg(es, dataset, {field: p.key, agg_size: 10})))
    nonTextProps.forEach((prop, i) => {
      const aggResult = responses[i]
      prop['x-cardinality'] = aggResult.total_values
      const firstValue = aggResult.aggs[0]
      if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
      if (aggResult.total_values <= 10) {
        prop.enum = aggResult.aggs.map(a => a.value)
      }
    })
  }

  if (bboxPromise) {
    result.bbox = dataset.bbox = (await bboxPromise).bbox
  }

  Object.assign(dataset, result)
  await collection.updateOne({id: dataset.id}, {$set: result})
}
