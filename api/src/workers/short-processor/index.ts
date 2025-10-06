import config from '#config'
import mongo from '#mongo'
import es from '#es'
import debugLib from 'debug'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import type { Dataset, DatasetInternal, RestDataset } from '#types'

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
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
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
