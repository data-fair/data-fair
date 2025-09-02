import config from '#config'
import mongo from '#mongo'
import debugLib from 'debug'
import { CronJob } from 'cron'
import * as catalogs from '../../catalogs/plugins/index.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { Application, Dataset, DatasetInternal, RestDataset } from '#types'

export const harvest = async function (catalog: any) {
  await mongo.connect(true)
  const debug = debugLib(`worker:catalog-harvester:${catalog.id}`)
  const db = mongo.db
  const date = new Date()

  const patch = { autoUpdate: JSON.parse(JSON.stringify(catalog.autoUpdate || {})) }
  patch.autoUpdate.lastUpdate = { date }

  try {
    await catalogs.updateAllHarvestedDatasets(catalog)
  } catch (err: any) {
    internalError('catalog-harvester', err)
    patch.autoUpdate.lastUpdate.error = err.message
  }

  const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
  patch.autoUpdate.nextUpdate = job.nextDate().toISO()

  await db.collection('catalogs').updateOne({ id: catalog.id }, { $set: patch })
  debug('done')
}

export const publishApplication = async function (application: Application) {
  await mongo.connect(true)
  return catalogs.processPublications('application', application)
}

export const publishDataset = async function (dataset: Dataset) {
  await mongo.connect(true)
  return catalogs.processPublications('dataset', dataset)
}

export const renewApiKey = async function (dataset: DatasetInternal) {
  const datasetsService = await import('../../datasets/service.js')
  const readApiKeyUtils = await import('../../datasets/utils/read-api-key.js')
  const debug = debugLib(`worker:read-api-key-renewer:${dataset.id}`)

  const patch: Partial<DatasetInternal> = { readApiKey: { ...dataset.readApiKey } }
  patch._readApiKey = readApiKeyUtils.update(dataset.owner, patch.readApiKey, dataset._readApiKey)
  debug('renewing readApiKey', patch)
  await datasetsService.applyPatch(dataset, patch)
  debug('done')
}

export const manageTTL = async function (dataset: RestDataset) {
  const restUtils = await import('../../datasets/utils/rest.ts')
  return restUtils.applyTTL(dataset)
}

export const finalize = async function (dataset: Dataset) {
  await mongo.connect(true)
  const finalize = await import('./finalize.ts')
  await finalize.default(dataset)
}
