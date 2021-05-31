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
  const queryableDataset = { ...dataset }

  const result = { status: 'finalized', schema: dataset.schema }

  if (dataset.isVirtual) {
    queryableDataset.descendants = await virtualDatasetsUtils.descendants(db, dataset)
    queryableDataset.schema = result.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
  }

  // Add the calculated fields to the schema
  debug('prepare extended schema')
  queryableDataset.schema = result.schema = datasetUtils.extendedSchema(dataset)

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  // Try to calculate enum values
  const cardinalityProps = dataset.schema
    .filter(prop => !prop.key.startsWith('_'))
    .filter(prop => prop['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
    .filter(prop => !prop['x-capabilities'] || prop['x-capabilities'].values !== false)
  for (const prop of cardinalityProps) {
    debug(`Calculate cardinality of field ${prop.key}`)
    const aggResult = await esUtils.valuesAgg(es, queryableDataset, { field: prop.key, agg_size: '50', precision_threshold: 3000 })
    prop['x-cardinality'] = aggResult.total_values
    debug(`Cardinality of field ${prop.key} is ${prop['x-cardinality']}`)
    // store a list of values if the cardinality is not too large and
    let setEnum = aggResult.total_values > 0 && aggResult.total_values <= 50
    // cardinality is not too close to overall count
    // also if the cell is not too sparse
    if (setEnum) {
      const totalWithValue = aggResult.aggs.reduce((t, item) => { t += item.total; return t }, 0)
      // cardinality is not too close to overall count
      if (aggResult.total_values > totalWithValue / 2) setEnum = false
      // also if the cell is not too sparse
      if (totalWithValue <= aggResult.total / 5) setEnum = false
    }
    if (setEnum) {
      debug(`Set enum of field ${prop.key}`)
      prop.enum = aggResult.aggs.map(a => a.value).filter(v => {
        if (typeof v === 'string') return !!v.trim()
        else return true
      })
    } else {
      delete prop.enum
    }
  }

  // calculate geographical coverage
  if (geopoint || geometry) {
    debug('calculate bounding ok')
    queryableDataset.bbox = []
    result.bbox = dataset.bbox = (await esUtils.bboxAgg(es, queryableDataset)).bbox
    debug('bounding box ok', result.bbox)
  } else {
    result.bbox = null
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

  result.finalizedAt = (new Date()).toISOString()
  if (dataset.isRest && (await collection.findOne({ id: dataset.id })).status === 'updated') {
    // dataset was updated while we were finalizing.. keep it as such
    delete result.status
  }
  Object.assign(dataset, result)

  // manage mbtiles
  if (!dataset.isRest && !dataset.isVirtual) {
    if (dataset.bbox) {
      debug('prepare mbtiles')
      await tilesUtils.prepareMbtiles(dataset, db, es)
    } else {
      debug('delete geo files')
      await tilesUtils.deleteMbtiles(dataset)
    }
  }

  // Remove attachments if the schema does not refer to their existence
  if (!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    await attachmentsUtils.removeAll(dataset)
  }

  // virtual datasets have to be re-counted here (others were implicitly counte ad index step)
  if (dataset.isVirtual) {
    dataset.descendants = await virtualDatasetsUtils.descendants(db, dataset)
    result.count = dataset.count = await esUtils.count(es, queryableDataset, {})
  }

  await collection.updateOne({ id: dataset.id }, { $set: result })

  // parent virtual datasets have to be re-finalized too
  for await (const virtualDataset of collection.find({ 'virtual.children': dataset.id })) {
    await collection.updateOne({ id: virtualDataset.id }, { $set: { status: 'indexed' } })
  }

  debug('done')
}
