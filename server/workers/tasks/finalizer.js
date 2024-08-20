const esUtils = require('../../datasets/es')
const geoUtils = require('../../datasets/utils/geo')
const datasetUtils = require('../../datasets/utils')
const attachmentsUtils = require('../../datasets/utils/attachments')
const virtualDatasetsUtils = require('../../datasets/utils/virtual')
const taskProgress = require('../../datasets/utils/task-progress')
const restDatasetsUtils = require('../../datasets/utils/rest')

exports.process = async function (app, dataset, patch) {
  const debug = require('debug')(`worker:finalizer:${dataset.id}`)

  const db = app.get('db')
  const es = app.get('es')
  const queryableDataset = { ...dataset }

  patch.schema = dataset.schema

  if (dataset.isVirtual) {
    queryableDataset.descendants = await virtualDatasetsUtils.descendants(db, dataset, false)
    queryableDataset.schema = patch.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
  }

  // Add the calculated fields to the schema
  debug('prepare extended schema')
  queryableDataset.schema = patch.schema = await datasetUtils.extendedSchema(db, dataset)

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  const dateField = dataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/Date')
  const startDateField = dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') ?? dateField
  const endDateField = dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate') ?? dateField

  // Try to calculate enum values
  const cardinalityProps = dataset.schema
    .filter(prop => !prop['x-calculated'])
    .filter(prop => prop['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
    .filter(prop => prop['x-refersTo'] !== 'http://schema.org/latitude')
    .filter(prop => prop['x-refersTo'] !== 'http://schema.org/longitude')
    .filter(prop => !prop['x-capabilities'] || prop['x-capabilities'].values !== false)

  let nbSteps = cardinalityProps.length + 1
  if (startDateField || endDateField) nbSteps += 1
  if (geopoint || geometry) nbSteps += 1
  const progress = taskProgress(app, dataset.id, 'finalize', nbSteps)
  await progress(0)

  for (const prop of cardinalityProps) {
    debug(`Calculate cardinality of field ${prop.key}`)
    const cardAggResult = await esUtils.valuesAgg(es, queryableDataset, { field: prop.key, agg_size: '0', precision_threshold: 3000 }, null, null, null, true, '10s')
    prop['x-cardinality'] = cardAggResult.total_values
    debug(`Cardinality of field ${prop.key} is ${prop['x-cardinality']}`)
    delete prop.enum
    // store a list of values if the cardinality is not too large and
    let setEnum = cardAggResult.total_values > 0 && cardAggResult.total_values <= 50
    // cardinality is not too close to overall count
    // also if the cell is not too sparse
    if (setEnum) {
      // this could be merged with the previous call to valuesAgg, but it is better to separate for performance on large datasets
      const valuesAggResult = await esUtils.valuesAgg(es, queryableDataset, { field: prop.key, agg_size: '50', precision_threshold: 0 }, null, null, null, true, '10s')
      const totalWithValue = valuesAggResult.aggs.reduce((t, item) => { t += item.total; return t }, 0)
      // cardinality is not too close to overall count
      if (cardAggResult.total_values > totalWithValue / 2) setEnum = false
      // also if the cell is not too sparse
      if (totalWithValue <= valuesAggResult.total / 5) setEnum = false
      if (setEnum) {
        debug(`Set enum of field ${prop.key}`)
        prop.enum = valuesAggResult.aggs.map(a => a.value).filter(v => {
          if (typeof v === 'string') return !!v.trim()
          else return true
        })
      }
    }
    await progress()
  }

  // calculate geographical coverage
  if (geopoint || geometry) {
    debug('calculate bounding ok')
    queryableDataset.bbox = []
    patch.bbox = dataset.bbox = (await esUtils.bboxAgg(es, queryableDataset, {}, true, '10s')).bbox
    debug('bounding box ok', patch.bbox)
    await progress()
  } else {
    patch.bbox = null
  }

  // calculate temporal coverage
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
    patch.timePeriod = {
      startDate: new Date(timePeriod.startDate).toISOString(),
      endDate: new Date(timePeriod.endDate).toISOString()
    }
    await progress()
  }

  patch.esWarning = await esUtils.datasetWarning(es, dataset)

  patch.finalizedAt = (new Date()).toISOString()
  /* TODO: implement this in a loop in the main worker instead of statuses tricks
  if (dataset.isRest && (await collection.findOne({ id: dataset.id })).status === 'updated') {
    // dataset was updated while we were finalizing.. keep it as such
    delete patch.status
  }
    */
  if (dataset.isRest) {
    await restDatasetsUtils.configureHistory(app, dataset)
  }

  // virtual datasets have to be re-counted here (others were implicitly counted at index step)
  if (dataset.isVirtual) {
    const descendants = await virtualDatasetsUtils.descendants(db, dataset, false, ['dataUpdatedAt', 'dataUpdatedBy'])
    dataset.descendants = descendants.map(d => d.id)
    const lastDataUpdate = descendants.filter(d => !!d.dataUpdatedAt).sort((d1, d2) => d1.dataUpdatedAt > d2.dataUpdatedAt ? 1 : -1).pop()
    if (lastDataUpdate) {
      patch.dataUpdatedAt = lastDataUpdate.dataUpdatedAt
      patch.dataUpdatedBy = lastDataUpdate.dataUpdatedBy
    }
    patch.count = dataset.count = await esUtils.count(es, queryableDataset, {})
  }

  patch.status = 'finalized'

  // Remove attachments if the schema does not refer to their existence
  if (!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    await attachmentsUtils.removeAll(dataset)
  }

  // TODO: move updateStorage into the main worker ?
  if (dataset.isVirtual) {
    await datasetUtils.updateStorage(app, queryableDataset)
  }

  await progress()

  debug('done')
}
