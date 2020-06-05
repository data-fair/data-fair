// Finalize dataset for publication
const esUtils = require('../utils/es')
const geoUtils = require('../utils/geo')
const tilesUtils = require('../utils/tiles')
const datasetUtils = require('../utils/dataset')
const attachmentsUtils = require('../utils/attachments')
const virtualDatasetsUtils = require('../utils/virtual-datasets')

exports.eventsPrefix = 'finalize'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:finalizer:${dataset.id}`)

  const db = app.get('db')
  const es = app.get('es')
  const collection = db.collection('datasets')

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  const queryableDataset = { ...dataset }
  if (dataset.isVirtual) {
    queryableDataset.descendants = await virtualDatasetsUtils.descendants(db, dataset)
  }

  const result = { status: 'finalized', schema: dataset.schema }

  // Try to calculate enum values
  const cardinalityProps = dataset.schema
    .filter(prop => !prop.key.startsWith('_'))
    .filter(prop => prop['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
  for (const prop of cardinalityProps) {
    debug(`Calculate cardinality of field ${prop.key}`)
    const aggResult = await esUtils.valuesAgg(es, queryableDataset, { field: prop.key, agg_size: '50', precision_threshold: 3000 })
    prop['x-cardinality'] = aggResult.total_values
    debug(`Cardinality of field ${prop.key} is ${prop['x-cardinality']}`)

    const firstValue = aggResult.aggs[0]
    if (firstValue && firstValue.total === 1) prop['x-cardinality'] = dataset.count
    if (!dataset.isRest && aggResult.total_values <= 50) {
      // Set enum based on actual value, except for REST datasets, we don't want to prevent writing new values
      debug(`Set enum of field ${prop.key}`)
      prop.enum = aggResult.aggs.map(a => a.value)
    }
  }

  // calculate geographical coverage
  if (geopoint || geometry) {
    debug('calculate bounding ok')
    queryableDataset.bbox = []
    result.bbox = dataset.bbox = (await esUtils.bboxAgg(es, queryableDataset)).bbox
    debug('bounding box ok', result.bbox)

    if (!dataset.isRest && !dataset.isVirtual) {
      debug('prepare mbtiles')
      await tilesUtils.prepareMbtiles(dataset, db, es)
    }
  } else {
    result.bbox = null
    if (!dataset.isRest && !dataset.isVirtual) {
      debug('delete geo files')
      await tilesUtils.deleteMbtiles(dataset)
    }
  }

  // calculate temporal coverage
  const startDateField = dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate')
  const endDateField = dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate')
  if (startDateField || endDateField) {
    const promises = []
    if (startDateField) {
      promises.push(esUtils.minAgg(es, queryableDataset, startDateField.key, {}))
      promises.push(esUtils.maxAgg(es, queryableDataset, startDateField.key, {}))
    }
    if (endDateField) {
      promises.push(esUtils.minAgg(es, queryableDataset, endDateField.key, {}))
      promises.push(esUtils.maxAgg(es, queryableDataset, endDateField.key, {}))
    }
    const limitValues = await Promise.all(promises)
    const timePeriod = limitValues.reduce((a, value) => {
      a.startDate = value > a.startDate ? a.startDate : value
      a.endDate = value > a.endDate ? value : a.endDate
      return a
    }, { startDate: limitValues[0], endDate: limitValues[0] })
    result.timePeriod = {
      startDate: new Date(timePeriod.startDate).toISOString(),
      endDate: new Date(timePeriod.endDate).toISOString(),
    }
  }

  // Add the calculated fields to the schema
  debug('prepare extended schema')
  result.schema = datasetUtils.extendedSchema(dataset)

  // Remove attachments if the schema does not refer to their existence
  if (!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    await attachmentsUtils.removeAll(dataset)
  }

  result.finalizedAt = (new Date()).toISOString()
  if (dataset.isRest && (await collection.findOne({ id: dataset.id })).status === 'updated') {
    // dataset was updated while we were finalizing.. keep it as such
    delete result.status
  }
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
  debug('done')
}
