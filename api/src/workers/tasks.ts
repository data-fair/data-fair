import path from 'node:path'
import type { ApplicationTask, CatalogTask, DatasetTask } from './types.ts'
import { Piscina } from 'piscina'
import config from '#config'
import { basicTypes, csvTypes } from '../datasets/utils/types.js'
import moment from 'moment'

const createWorkers = () => {
  const workers = {
    // IO based worker for all small-ish tasks that we don't want to be blocked by longer tasks
    shortProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './short-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency * 4,
      closeTimeout: config.worker.closeTimeout
    }),
    // mostly IO bound worker for anything that is mostly about moving files, downloading files, etc
    filesManager: new Piscina({
      filename: path.resolve(import.meta.dirname, './files-manager/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency * 2,
      closeTimeout: config.worker.closeTimeout
    }),
    // files analysis and normalization can be quite memory and cpu hungry, better to use thread segregation and a small concurrency
    filesProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './files-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: config.worker.baseConcurrency,
      concurrentTasksPerWorker: 1,
      closeTimeout: config.worker.closeTimeout
    }),
    // a worker that works on large batches of data, mostly IO and sometimes CPU intensive but streamed so memory should be ok
    batchProcessor: new Piscina({
      filename: path.resolve(import.meta.dirname, './batch-processor/index.ts'),
      minThreads: 0,
      idleTimeout: 60 * 1000,
      maxThreads: 1,
      concurrentTasksPerWorker: config.worker.baseConcurrency,
      closeTimeout: config.worker.closeTimeout
    })
  }
  if (process.env.NODE_ENV === 'test') {
    for (const worker of Object.values(workers)) {
      worker.on('message', (message) => {
        // @ts-ignore
        global.events.emit('notification', message)
      })
    }
  }

  return workers
}

export const workers = createWorkers()

export const pendingTasks = {
  shortProcessor: 0,
  filesManager: 0,
  filesProcessor: 0,
  batchProcessor: 0
}

const isNormalizedMongoFilter = (prefix = '', not = false) => ({
  [not ? '$nor' : '$or']: [
    { [prefix + 'status']: 'stored', [prefix + 'originalFile.mimetype']: { $in: basicTypes } },
    { [prefix + 'status']: 'normalized' }
  ]
})

const isValidatedMongoFilter = (prefix = '') => ({
  $or: [
    { [prefix + 'file']: { $exists: 1 }, [prefix + 'status']: 'validated' },
    { isRest: true, status: 'analyzed' },
    { isRest: true, _partialRestStatus: 'updated' }
  ]
})
const activeExtensionMongoFilter = (prefix = '') => ({ [prefix + 'extensions.active']: true })
const noActiveExtensionMongoFilter = (prefix = '') => ({ [prefix + 'extensions']: { $not: { $elemMatch: { active: true } } } })

const datasetTasks: DatasetTask[] = [{
  name: 'initialize',
  eventsPrefix: 'initialize',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'created' }, { 'draft.status': 'created' }] })
}, {
  name: 'storeFile',
  eventsPrefix: 'store',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'loaded' }, { 'draft.status': 'loaded' }] })
}, {
  name: 'downloadFile',
  eventsPrefix: 'download',
  worker: 'filesManager',
  mongoFilter: () => ({ status: 'imported' })
}, {
  name: 'normalizeFile',
  eventsPrefix: 'normalize',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [{ status: 'stored' }, isNormalizedMongoFilter('', true)] },
      { $and: [{ 'draft.status': 'stored' }, isNormalizedMongoFilter('draft.', true)] },
    ]
  })
}, {
  name: 'analyzeCsv',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), { 'file.mimetype': { $in: csvTypes } }] },
      { $and: [isNormalizedMongoFilter('draft.'), { 'draft.file.mimetype': { $in: csvTypes } }] }
    ]
  })
}, {
  name: 'analyzeGeojson',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), { 'file.mimetype': 'application/geo+json' }] },
      { $and: [isNormalizedMongoFilter('draft.'), { 'draft.file.mimetype': 'application/geo+json' }] }
    ]
  })
}, {
  name: 'validateFile',
  eventsPrefix: 'validate',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] } },
      { 'draft.file': { $exists: true }, 'draft.status': { $in: ['analyzed', 'validation-updated'] } }
    ]
  })
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), activeExtensionMongoFilter()] },
      { $and: [isValidatedMongoFilter('draft.'), activeExtensionMongoFilter('draft.')] }
    ]
  })
}, {
  name: 'indexLines',
  eventsPrefix: 'index',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), noActiveExtensionMongoFilter()] },
      { $and: [isValidatedMongoFilter('draft.'), noActiveExtensionMongoFilter('draft.')] },
      { status: 'extended' },
      { 'draft.status': 'extended' },
      { isRest: true, _partialRestStatus: 'extended' }
    ]
  })
}, {
  name: 'finalize',
  eventsPrefix: 'finalize',
  worker: 'shortProcessor',
  mongoFilter: () => ({ $or: [{ status: 'indexed' }, { 'draft.status': 'indexed' }, { isRest: true, _partialRestStatus: 'indexed' }] }),
}, {
  name: 'exportRest',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    status: 'finalized',
    isRest: true,
    'exports.restToCSV.active': true,
    'dataset.exports.restToCSV.nextExport': { $lt: new Date().toISOString() }
  })
}, {
  name: 'publishDataset',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    $or: [{
      isMetaOnly: true,
      status: 'finalized'
    }],
    draftReason: { $exists: false },
    'publications.status': { $in: ['waiting', 'delete'] }
  })
}, {
  name: 'renewApiKey',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'readApiKey.active': true, 'readApiKey.renewAt': { $lt: new Date().toISOString() } })
}, {
  name: 'manageTTL',
  worker: 'shortProcessor',
  mongoFilter: () => ({ status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, $or: [{ 'rest.ttl.checkedAt': { $lt: moment().subtract(1, 'hours').toISOString() } }, { 'rest.ttl.checkedAt': { $exists: false } }] })
}, {
  name: 'autoUpdate',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    'remoteFile.autoUpdate.active': true,
    'dataset.remoteFile.autoUpdate.nextUpdate': { $lt: new Date().toISOString() }
  })
}, {
  name: 'errorRetry',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    $or: [
      { status: 'error', errorStatus: { $exists: true }, errorRetry: { $lt: new Date().toISOString() } },
      { 'draft.status': 'error', 'draft.errorStatus': { $exists: true }, 'draft.errorRetry': { $lt: new Date().toISOString() } }
    ]
  })
}, {
  name: 'autoUpdateExtension',
  worker: 'shortProcessor',
  mongoFilter: () => ({ status: 'finalized', isRest: true, 'extensions.nextUpdate': { $lt: new Date().toISOString() } })
}]

const applicationTasks: ApplicationTask[] = [{
  name: 'publishApplication',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    'publications.status': { $in: ['waiting', 'delete'] }
  })
}]

const catalogTasks: CatalogTask[] = [{
  name: 'harvest',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'autoUpdate.active': true, 'autoUpdate.nextUpdate': { $lt: new Date().toISOString() } })
}]

export const tasks = {
  catalogs: catalogTasks,
  datasets: datasetTasks,
  applications: applicationTasks
}
