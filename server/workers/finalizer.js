// Finalize dataset for publication
const esUtils = require('../utils/es')
const geoUtils = require('../utils/geo')
const extensionsUtils = require('../utils/extensions')

exports.type = 'dataset'
exports.eventsPrefix = 'finalize'

// either extended or there are no extensions to perform
exports.filter = { $or: [
  { status: 'extended' },
  { $and: [
    { status: 'indexed' },
    { extensions: { $not: { $elemMatch: { active: true } } } }
  ] }
] }

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:finalizer:${dataset.id}`)

  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  if (!dataset.isVirtual) {
    // Calculate fields after indexing and extension as we might depend on all fields
    if (geometry || geopoint) {
      debug(`Call extendCalculated() with geopoint ${geopoint} and geometry ${geometry}`)
      await extensionsUtils.extendCalculated(app, dataset, geopoint, geometry)
      debug('extendCalculated ok')
    } else {
      debug('No need for extendCalculated on this dataset')
    }
  }

  const result = { status: 'finalized' }

  // Try to calculate enum values
  const nonGeometryProps = dataset.schema.filter(prop => prop['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
  if (nonGeometryProps.length) result.schema = dataset.schema
  for (let prop of nonGeometryProps) {
    debug(`Calculate cardinality of field ${prop.key}`)
    const aggResult = await esUtils.valuesAgg(es, dataset, { field: prop.key, agg_size: '50', precision_threshold: 3000 })
    prop['x-cardinality'] = aggResult.total_values
    debug(`Cardinality of field ${prop.key} is ${prop['x-cardinality']}`)

    const firstValue = aggResult.aggs[0]
    if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (aggResult.total_values <= 50) {
      debug(`Set enum of field ${prop.key}`)
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  if (geopoint || geometry) {
    debug('calculate bounding ok')
    result.bbox = dataset.bbox = (await esUtils.bboxAgg(es, dataset)).bbox
    debug('bounding box ok', result.bbox)
  } else {
    result.bbox = null
  }

  result.finalizedAt = (new Date()).toISOString()
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
  debug('done')
}
