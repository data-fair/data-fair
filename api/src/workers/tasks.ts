import path from 'node:path'
import type { DatasetTask } from './types.ts'
import { Piscina } from 'piscina'
import config from '#config'
import { basicTypes, csvTypes } from '../datasets/utils/types.js'
import moment from 'moment'
import { piscinaGauge } from '../misc/utils/metrics.ts'
import { type ResourceType } from '#types'
import { type AccountKeys } from '@data-fair/lib-express'
import testEvents from '../misc/utils/test-events.ts'

const createWorkers = () => {
  const workers = {
    // IO based worker for all small-ish tasks that we don't want to be blocked by longer tasks
    shortProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './short-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency * 4,
      closeTimeout: config.worker.closeTimeout,
      resourceLimits: {
        maxOldGenerationSizeMb: 512
      }
    }),
    // mostly IO bound worker for anything that is mostly about moving files, downloading files, etc
    filesManager: new Piscina({
      filename: path.resolve(import.meta.dirname, './files-manager/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency * 2,
      closeTimeout: config.worker.closeTimeout,
      resourceLimits: {
        maxOldGenerationSizeMb: 512
      }
    }),
    // files analysis and normalization can be quite memory and cpu hungry, better to use thread segregation and a small concurrency
    filesProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './files-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: config.worker.baseConcurrency,
      concurrentTasksPerWorker: 1,
      closeTimeout: config.worker.closeTimeout,
      resourceLimits: {
        maxOldGenerationSizeMb: 1024
      }
    }),
    // a worker that works on large batches of data, mostly IO and sometimes CPU intensive but streamed so memory should be ok
    batchProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './batch-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency * 2,
      closeTimeout: config.worker.closeTimeout,
      resourceLimits: {
        maxOldGenerationSizeMb: 512
      }
    })
  }
  if (process.env.NODE_ENV === 'test') {
    for (const worker of Object.values(workers)) {
      worker.on('message', (message) => {
        testEvents.emit('notification', message)
      })
    }
  }

  return workers
}

export const workers = createWorkers()
piscinaGauge(workers)

console.log(`
Workers are configured with a base concurrency of ${config.worker.baseConcurrency}.
You should allocate about ${2 * config.worker.baseConcurrency}GB of memory.
`)

type PendingTask = {
  type: ResourceType,
  slug: string,
  id: string,
  owner: AccountKeys,
  startedAt: string
}

export const pendingTasks = {
  shortProcessor: {} as Record<string, PendingTask>,
  filesManager: {} as Record<string, PendingTask>,
  filesProcessor: {} as Record<string, PendingTask>,
  batchProcessor: {} as Record<string, PendingTask>
}

const isNormalizedMongoFilter = (draft = false, not = false) => {
  const prefix = draft ? 'draft.' : ''
  const conditions: any[] = [
    { [prefix + 'status']: 'stored', [prefix + 'originalFile.mimetype']: { $in: basicTypes } },
    { [prefix + 'status']: 'normalized' }
  ]
  if (draft) {
    conditions.push({ 'draft.status': 'stored', 'draft.originalFile': { $exists: false }, 'originalFile.mimetype': { $in: basicTypes } })
  }
  return { [not ? '$nor' : '$or']: conditions }
}

const isValidatedMongoFilter = (prefix = '') => ({
  $or: [
    { [prefix + 'file']: { $exists: 1 }, [prefix + 'status']: 'validated' },
    { isRest: true, status: 'analyzed' }
  ]
})
const activeExtensionMongoFilter = (draft = false, not = false) => {
  const prefix = draft ? 'draft.' : ''
  const conditions: any[] = [{ [prefix + 'extensions.active']: true }]
  if (draft) {
    conditions.push({ 'extensions.active': true, 'draft.extensions': { $exists: false } })
  }
  return { [not ? '$nor' : '$or']: conditions }
}

const noActiveDraftFilter = { 'draft.status': { $in: [null, 'finalized', 'error'] } }

const datasetTasks: DatasetTask[] = [{
  name: 'initialize',
  eventsPrefix: 'initialize',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'created', ...noActiveDraftFilter }, { 'draft.status': 'created' }] })
}, {
  name: 'storeFile',
  eventsPrefix: 'store',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'loaded', ...noActiveDraftFilter }, { 'draft.status': 'loaded' }] })
}, {
  name: 'downloadFile',
  eventsPrefix: 'download',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'imported', ...noActiveDraftFilter }, { 'draft.status': 'imported' }] })
}, {
  name: 'normalizeFile',
  eventsPrefix: 'normalize',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [{ status: 'stored', ...noActiveDraftFilter }, isNormalizedMongoFilter(false, true)] },
      { $and: [{ 'draft.status': 'stored' }, isNormalizedMongoFilter(true, true)] },
    ]
  })
}, {
  name: 'analyzeCsv',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), noActiveDraftFilter, { 'file.mimetype': { $in: csvTypes } }] },
      {
        $and: [isNormalizedMongoFilter(true), {
          $or: [
            { 'draft.file.mimetype': { $in: csvTypes } },
            { 'draft.file': { $exists: false }, 'file.mimetype': { $in: csvTypes } }
          ]
        }]
      }
    ]
  })
}, {
  name: 'analyzeGeojson',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), noActiveDraftFilter, { 'file.mimetype': 'application/geo+json' }] },
      {
        $and: [isNormalizedMongoFilter(true), {
          $or: [
            { 'draft.file.mimetype': 'application/geo+json' },
            { 'draft.file': { $exists: false }, 'file.mimetype': 'application/geo+json' }
          ]
        }]
      }
    ]
  })
}, {
  name: 'validateFile',
  eventsPrefix: 'validate',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] }, ...noActiveDraftFilter },
      { 'draft.file': { $exists: true }, 'draft.status': { $in: ['analyzed', 'validation-updated'] } }
    ]
  })
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), noActiveDraftFilter, activeExtensionMongoFilter()] },
      { $and: [isValidatedMongoFilter('draft.'), activeExtensionMongoFilter(true)] },
      { isRest: true, status: 'finalized', 'extensions.active': true, _partialRestStatus: 'updated' },
      { isRest: true, status: 'finalized', extensions: { $elemMatch: { active: true, needsUpdate: true } }, _partialRestStatus: null }
    ]
  })
}, {
  name: 'indexLines',
  eventsPrefix: 'index',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), noActiveDraftFilter, activeExtensionMongoFilter(false, true)] },
      { $and: [isValidatedMongoFilter('draft.'), activeExtensionMongoFilter(true, true)] },
      { status: 'extended', ...noActiveDraftFilter },
      { 'draft.status': 'extended' },
      { isRest: true, status: 'finalized', _partialRestStatus: 'extended' },
      { isRest: true, status: 'finalized', _partialRestStatus: 'updated', extensions: { $not: { $elemMatch: { active: true } } } }
    ]
  })
}, {
  name: 'finalize',
  eventsPrefix: 'finalize',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    $or: [
      { status: 'indexed', ...noActiveDraftFilter },
      { 'draft.status': 'indexed' },
      { isRest: true, status: 'finalized', _partialRestStatus: 'indexed' }
    ]
  }),
}, {
  name: 'renewApiKey',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'readApiKey.active': true, 'readApiKey.renewAt': { $lt: new Date().toISOString() } })
}, {
  name: 'manageTTL',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    status: 'finalized',
    count: { $gt: 0 },
    isRest: true,
    'rest.ttl.active': true,
    _partialRestStatus: null,
    $or: [{ 'rest.ttl.checkedAt': { $lt: moment().subtract(1, 'hours').toISOString() } }, { 'rest.ttl.checkedAt': { $exists: false } }]
  })
}, {
  name: 'autoUpdate',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    status: 'finalized',
    draft: { $exists: false },
    'remoteFile.autoUpdate.active': true,
    'remoteFile.autoUpdate.nextUpdate': { $lt: new Date().toISOString() }
  })
}, {
  name: 'errorRetry',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    $or: [
      { status: 'error', errorStatus: { $exists: true }, errorRetry: { $lt: new Date().toISOString() }, ...noActiveDraftFilter },
      { 'draft.status': 'error', 'draft.errorStatus': { $exists: true }, 'draft.errorRetry': { $lt: new Date().toISOString() } }
    ]
  })
}, {
  name: 'autoUpdateExtension',
  worker: 'shortProcessor',
  mongoFilter: () => ({ status: 'finalized', isRest: true, 'extensions.nextUpdate': { $lt: new Date().toISOString() } })
}]

export const tasks = { datasets: datasetTasks }
