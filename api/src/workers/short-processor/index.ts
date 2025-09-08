import config from '#config'
import mongo from '#mongo'
import es from '#es'
import debugLib from 'debug'
import { CronJob } from 'cron'
import * as catalogs from '../../catalogs/plugins/index.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
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
  await wsEmitter.init(mongo.db)
  return catalogs.processPublications('application', application)
}

export const publishDataset = async function (dataset: Dataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  return catalogs.processPublications('dataset', dataset)
}

export const renewApiKey = async function (dataset: DatasetInternal) {
  await mongo.connect(true)
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
  await mongo.connect(true)
  const restUtils = await import('../../datasets/utils/rest.ts')
  return restUtils.applyTTL(dataset)
}

export const autoUpdate = async function (dataset: Dataset) {
  await mongo.connect(true)
  const draft = {
    status: 'imported',
    draftReason: {
      key: 'file-updated' as const,
      message: 'Nouveau fichier chargé sur un jeu de données existant',
      validationMode: 'always' as const
    }
  }
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { draft } })
}

export const errorRetry = async function (dataset: Dataset) {
  await mongo.connect(true)
  const propertyPrefix = dataset.draftReason ? 'draft.' : ''
  const patch = {
    $set: {
      [propertyPrefix + 'status']: dataset.errorStatus
    },
    $unset: {
      [propertyPrefix + 'errorStatus']: 1 as const,
      [propertyPrefix + 'errorRetry']: 1 as const
    }
  }
  await mongo.datasets.updateOne({ id: dataset.id }, patch)
}

export const autoUpdateExtension = async function (dataset: Dataset) {
  await mongo.connect(true)
  const extensions = [...dataset.extensions!]
  for (const e of extensions) {
    if (e.nextUpdate && e.nextUpdate < new Date().toISOString()) {
      e.needsUpdate = true
      delete e.nextUpdate
    }
  }
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { extensions } })
}

export const finalize = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  const finalize = await import('./finalize.ts')
  await finalize.default(dataset)
}

if (process.env.NODE_ENV === 'test') {
  const nock = (await import('nock')).default
  // fake catalog
  nock('http://test-catalog.com')
    .persist()
    .get('/api/1/site/').reply(200, { title: 'My catalog' })
    .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{ name: 'Koumoul' }])
    .get('/api/1/datasets/suggest/?q=test').reply(200, [{ title: 'Test dataset' }])
    .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

  // fake catalog
  nock('http://not-a-catalog.com')
    .persist()
}
