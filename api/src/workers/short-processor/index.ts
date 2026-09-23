import config from '#config'
import mongo from '#mongo'
import es from '#es'
import debugLib from 'debug'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import { indexPatch, mergeIndexUpdate } from '../../misc/utils/text-search/index.ts'
import type { Dataset, DatasetInternal, RestDataset } from '#types'

export const renewApiKey = async function (dataset: DatasetInternal) {
  await mongo.connect(true)
  const datasetsService = await import('../../datasets/service.ts')
  const readApiKeyUtils = await import('../../datasets/utils/read-api-key.ts')
  const debug = debugLib(`worker:read-api-key-renewer:${dataset.id}`)

  const patch: Partial<DatasetInternal> = { readApiKey: { ...dataset.readApiKey } }
  patch._readApiKey = readApiKeyUtils.update(dataset.owner, patch.readApiKey, dataset._readApiKey)
  debug('renewing readApiKey', patch)
  await datasetsService.applyPatch(dataset, patch)
  debug('done')
}

export const manageTTL = async function (dataset: RestDataset) {
  // es.connect is required because applyTTL iterates elasticsearch hits (iterHits -> es.client)
  // to find the expired lines to delete
  await Promise.all([mongo.connect(true), es.connect()])
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
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  const finalize = await import('./finalize.ts')
  await finalize.default(dataset)
}

export const historize = async function (dataset: Dataset) {
  await mongo.connect(true)
  const relay = await import('../../integrity/relay.ts')
  await relay.historize(dataset as any)
}

export const historizeLines = async function (dataset: RestDataset) {
  await mongo.connect(true)
  const relay = await import('../../integrity/lines-relay.ts')
  await relay.historizeLines(dataset)
}

/**
 * Shared tail of the two deferred search-index recomputes: write the computed fields and clear
 * the `_needsSearchIndex` flag, whatever happens.
 *
 * `computeDatasetSearchIndex`/`computeApplicationSearchIndex` are selected on
 * `_needsSearchIndex: true` and on nothing else, so — unlike every other worker task, which
 * filters on `status` — a failure does not change what they match. Letting an error escape to
 * the generic handler in `../index.ts` would: flag an otherwise healthy resource
 * `status: 'error'` from a task that is bookkeeping and writes no journal by design; leave the
 * flag set, so `loop()` re-selects the resource immediately and writes an `error` journal entry
 * on every round; and, for applications, strand the document in `error` forever, since
 * `applicationTasks` has no `errorRetry`.
 *
 * So the failure is swallowed here and the flag is cleared anyway. Deliberate tradeoff: the
 * document keeps its PREVIOUS (stale) index until its next write recomputes it, rather than the
 * worker spinning on it forever — staleness is the failure mode this design already accepts
 * everywhere else (see `markStale` in docs/architecture/catalog-search.md), a tight error loop is
 * not. The failure is reported through `internalError` so it stays visible in logs and metrics.
 */
const drainSearchIndex = async (
  type: 'datasets' | 'applications',
  id: string,
  computeIndex: () => Promise<Record<string, any> | null>
) => {
  const collection = mongo.db.collection(type)
  try {
    const searchIndex = await computeIndex()
    // the resource was deleted while the task waited for its slot: nothing to write, nothing to clear
    if (!searchIndex) return
    await collection.updateOne({ id }, mergeIndexUpdate({ $unset: { _needsSearchIndex: '' } }, searchIndex))
  } catch (err: any) {
    internalError('search-index-recompute', `failed to recompute the search index of ${type}/${id}, it keeps its previous index until its next write - ${err?.stack || err?.message || err}`)
    // clear the flag anyway, or this task is re-selected in a tight loop forever
    await collection.updateOne({ id }, { $unset: { _needsSearchIndex: '' } })
      .catch(clearErr => internalError('search-index-recompute-clear', `failed to clear _needsSearchIndex on ${type}/${id} - ${clearErr?.stack || clearErr?.message || clearErr}`))
  }
}

export const computeDatasetSearchIndex = async function (dataset: Dataset) {
  await mongo.connect(true)
  const { searchIndexPatch } = await import('../../datasets/utils/search-text.ts')
  await drainSearchIndex('datasets', dataset.id, async () => {
    // the dispatcher merges a pending draft into the resource it hands to a task (../index.ts), but
    // this index describes the PUBLISHED dataset: draft titles and draft column labels
    // must never reach the published _searchText/_terms. So index the raw stored document,
    // not the (possibly draft-merged) snapshot we were given.
    const published = await mongo.datasets.findOne({ id: dataset.id })
    if (!published) return null
    return searchIndexPatch(published)
  })
}

export const computeApplicationSearchIndex = async function (application: { id: string }) {
  await mongo.connect(true)
  const { applicationsTextSearch } = await import('../../misc/utils/text-search/collections.ts')
  await drainSearchIndex('applications', application.id, async () => {
    // applications have no drafts, but re-reading keeps both recomputes symmetrical and makes the
    // index describe the stored document rather than the snapshot captured at selection time
    const stored = await mongo.applications.findOne({ id: application.id })
    if (!stored) return null
    return indexPatch(applicationsTextSearch, stored)
  })
}

if (process.env.NODE_ENV === 'development') {
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
