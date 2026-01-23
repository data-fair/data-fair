// Finalize dataset for publication
import config from '#config'
import * as esUtils from '../../datasets/es/index.ts'
import { datasetWarning } from '../../datasets/es/manage-indices.js'
import * as geoUtils from '../../datasets/utils/geo.js'
import * as datasetUtils from '../../datasets/utils/index.js'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetService from '../../datasets/service.js'
import * as attachmentsUtils from '../../datasets/utils/attachments.ts'
import * as virtualDatasetsUtils from '../../datasets/utils/virtual.ts'
import taskProgress from '../../datasets/utils/task-progress.ts'
import * as restDatasetsUtils from '../../datasets/utils/rest.ts'
import dayjs from 'dayjs'
import mongo from '#mongo'

import debugLib from 'debug'
import { getFlattenNoCache } from '../../datasets/utils/flatten.ts'
import type { DatasetInternal, Nullable } from '#types'
import { isVirtualDataset } from '#types/dataset/index.ts'
import { isRestDataset } from '@data-fair/data-fair-shared/types-utils.ts'

export const eventsPrefix = 'finalize'

export default async function (_dataset: DatasetInternal) {
  let dataset = _dataset

  const debug = debugLib(`worker:finalizer:${dataset.id}`)

  const db = mongo.db
  const queryableDataset = { ...dataset }

  const result: Partial<Nullable<DatasetInternal>> = { status: 'finalized', schema: dataset.schema }

  if (isVirtualDataset(dataset)) {
    queryableDataset.descendants = await virtualDatasetsUtils.descendants(dataset)
    queryableDataset.schema = result.schema = await virtualDatasetsUtils.prepareSchema(dataset)
  }

  // Add the calculated fields to the schema
  debug('prepare extended schema')
  queryableDataset.schema = result.schema = await datasetUtils.extendedSchema(db, dataset)

  const geopoint = geoUtils.schemaHasGeopoint(dataset.schema)
  const geometry = geoUtils.schemaHasGeometry(dataset.schema)

  const dateField = dataset.schema?.find(p => p['x-refersTo'] === 'http://schema.org/Date')
  const startDateField = dataset.schema?.find(f => f['x-refersTo'] === 'https://schema.org/startDate') ?? dateField
  const endDateField = dataset.schema?.find(f => f['x-refersTo'] === 'https://schema.org/endDate') ?? dateField

  // Try to calculate enum values
  const cardinalityProps = (dataset.schema ?? [])
    .filter(prop => !prop['x-calculated'])
    .filter(prop => prop['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
    .filter(prop => prop['x-refersTo'] !== 'http://schema.org/latitude')
    .filter(prop => prop['x-refersTo'] !== 'http://schema.org/longitude')
    .filter(prop => !prop['x-capabilities'] || prop['x-capabilities'].values !== false)

  let nbSteps = cardinalityProps.length + 1
  if (startDateField || endDateField) nbSteps += 1
  if (geopoint || geometry) nbSteps += 1
  const progress = taskProgress(dataset.id, eventsPrefix, nbSteps)
  await progress.inc(0)
  const flatten = getFlattenNoCache(queryableDataset)
  for (const prop of cardinalityProps) {
    debug(`Calculate cardinality of field ${prop.key}`)
    const cardAggResult: any = await esUtils.valuesAgg(queryableDataset, { field: prop.key, agg_size: '0', precision_threshold: 3000 }, null, null, null, flatten, true, '10s')
    prop['x-cardinality'] = cardAggResult.total_values
    debug(`Cardinality of field ${prop.key} is ${prop['x-cardinality']}`)
    delete prop.enum
    // store a list of values if the cardinality is not too large and
    let setEnum = cardAggResult.total_values > 0 && cardAggResult.total_values <= 50
    // cardinality is not too close to overall count
    // also if the cell is not too sparse
    if (setEnum) {
      // this could be merged with the previous call to valuesAgg, but it is better to separate for performance on large datasets
      const valuesAggResult: any = await esUtils.valuesAgg(queryableDataset, { field: prop.key, agg_size: '50', precision_threshold: 0 }, null, null, null, flatten, true, '10s')
      const totalWithValue = valuesAggResult.aggs.reduce((t: number, item: { total: number }) => { t += item.total; return t }, 0)
      // cardinality is not too close to overall count
      if (cardAggResult.total_values > totalWithValue / 2) setEnum = false
      // also if the cell is not too sparse
      if (totalWithValue <= valuesAggResult.total / 5) setEnum = false
      if (setEnum) {
        debug(`Set enum of field ${prop.key}`)
        prop.enum = valuesAggResult.aggs.map(a => {
          if (typeof a.value === 'string' && !!a.value && prop.type === 'string' && prop.format === 'date') {
            return a.value.slice(0, 10)
          }
          if (typeof a.value === 'string') return a.value.trim()
          return a.value
        }).filter(v => Boolean)
      }
    }
    await progress.inc()
  }

  // calculate geographical coverage
  if (geopoint || geometry) {
    debug('calculate bounding ok')
    queryableDataset.bbox = []
    result.bbox = dataset.bbox = (await esUtils.bboxAgg(queryableDataset, {}, true, '10s') as any).bbox
    debug('bounding box ok', result.bbox)
    await progress.inc()
  } else {
    result.bbox = null
  }

  // calculate temporal coverage
  if (startDateField || endDateField) {
    const promises: Promise<number>[] = []
    if (startDateField) {
      promises.push(esUtils.minAgg(queryableDataset, startDateField.key, {}))
      promises.push(esUtils.maxAgg(queryableDataset, startDateField.key, {}))
    }
    if (endDateField) {
      promises.push(esUtils.minAgg(queryableDataset, endDateField.key, {}))
      promises.push(esUtils.maxAgg(queryableDataset, endDateField.key, {}))
    }
    const limitValues = await Promise.all(promises)
    const timePeriod = limitValues.reduce((a, value) => {
      a.startDate = value > a.startDate ? a.startDate : value
      a.endDate = value > a.endDate ? value : a.endDate
      return a
    }, { startDate: limitValues[0], endDate: limitValues[0] })
    result.timePeriod = {
      startDate: new Date(timePeriod.startDate).toISOString(),
      endDate: new Date(timePeriod.endDate).toISOString()
    }
    await progress.inc()
  }

  result.esWarning = await datasetWarning(dataset)

  if (isRestDataset(dataset)) {
    await restDatasetsUtils.configureHistory(dataset)
  }

  result.finalizedAt = (new Date()).toISOString()

  // virtual datasets have to be re-counted here (others were implicitly counted at index step)
  if (isVirtualDataset(dataset)) {
    const descendants: DatasetInternal[] = await virtualDatasetsUtils.descendants(dataset, ['dataUpdatedAt', 'dataUpdatedBy'])
    dataset.descendants = descendants.map(d => d.id)
    const lastDataUpdate = descendants.filter(d => !!d.dataUpdatedAt).sort((d1, d2) => d1.dataUpdatedAt! > d2.dataUpdatedAt! ? 1 : -1).pop()
    if (lastDataUpdate) {
      result.dataUpdatedAt = lastDataUpdate.dataUpdatedAt
      result.dataUpdatedBy = lastDataUpdate.dataUpdatedBy
    }
    result.count = dataset.count = await esUtils.count(queryableDataset, {})
  }

  if (dataset.draftReason && (dataset as DatasetInternal).validateDraft) {
    const datasetFull = await mongo.datasets.findOne({ id: dataset.id })
    if (!datasetFull) throw new Error('failed to read dataset')
    await datasetService.validateDraft(dataset, datasetFull, result)
    await datasetService.applyPatch(datasetFull, result)
    dataset = datasetFull
  } else {
    if (dataset.isRest && (dataset as DatasetInternal)._partialRestStatus) {
      // dataset was updated while we were finalizing.. keep it as such
      if ((await mongo.datasets.findOne({ id: dataset.id }, { projection: { _partialRestStatus: 1 } }))?._partialRestStatus === 'indexed') {
        result._partialRestStatus = null
      }
    }

    await datasetService.applyPatch(dataset, result)
    // console.log('applied', await collection.findOne({ id: dataset.id }))
  }

  // Remove attachments if the schema does not refer to their existence
  if (!dataset.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    await attachmentsUtils.removeAll(dataset)
  }

  if (!dataset.draftReason) {
    await updateStorage(dataset)

    // parent virtual datasets have to be re-finalized too
    for await (const virtualDataset of mongo.datasets.find({ 'virtual.children': dataset.id })) {
      await mongo.datasets.updateOne({ id: virtualDataset.id }, { $set: { status: 'indexed' } })
    }

    // trigger auto updates if this dataset is used as a source of extensions
    if (dataset.masterData?.bulkSearchs?.length) {
      const nextUpdate = dayjs().add(config.extensionUpdateDelay, 'seconds').toISOString()
      const cursor = db.collection('datasets').find({
        extensions: { $elemMatch: { active: true, autoUpdate: true, remoteService: 'dataset:' + dataset.id } }
      })
      for await (const extendedDataset of cursor) {
        for (const extension of extendedDataset.extensions) {
          if (extension.active && extension.autoUpdate && extension.remoteService === 'dataset:' + dataset.id) {
            extension.nextUpdate = nextUpdate
          }
        }
        await db.collection('datasets').updateOne({ id: extendedDataset.id }, { $set: { extensions: extendedDataset.extensions } })
      }
    }
  }

  await progress.inc()

  debug('done')
}
