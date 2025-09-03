import path from 'node:path'
import type { ApplicationTask, CatalogTask, DatasetTask } from './types.ts'
import { Piscina } from 'piscina'
import config from '#config'
import type { FileDataset, DatasetInternal } from '#types'
import { basicTypes, csvTypes } from '../datasets/utils/types.js'
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import moment from 'moment'

export const workers = {
  // IO based worker for all small-ish tasks that we don't want to be blocked by longer tasks
  shortProcessor: new Piscina({
    filename: path.resolve(import.meta.dirname, './short-processor.ts'),
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

const isNormalized = (dataset: FileDataset) =>
  (dataset.status === 'stored' && basicTypes.includes(dataset.originalFile?.mimetype)) || dataset.status === 'normalized'
const isNormalizedMongoFilter = (prefix = '') => ({
  $or: [
    { [prefix + 'status']: 'stored', [prefix + 'originalFile.mimetype']: { $in: basicTypes } },
    { [prefix + 'status']: 'normalized' }
  ]
})

const isValidated = (dataset: DatasetInternal) =>
  ((isFileDataset(dataset) && dataset.status === 'validated') || (isRestDataset(dataset) && (dataset.status === 'analyzed' || (dataset as DatasetInternal)._partialRestStatus === 'updated')))
const isValidatedMongoFilter = (prefix = '') => ({
  $or: [
    { [prefix + 'file']: { $exists: 1 }, [prefix + 'status']: 'validated' },
    { isRest: true, status: 'analyzed' },
    { isRest: true, _partialRestStatus: 'updated' }
  ]
})
const hasActiveExtension = (dataset: DatasetInternal) => !!dataset.extensions?.some(e => e.active)
const activeExtensionMongoFilter = (prefix = '') => ({ [prefix + 'extensions.active']: true })

const datasetTasks: DatasetTask[] = [{
  name: 'initialize',
  eventsPrefix: 'initialize',
  worker: 'filesManager',
  mongoFilter: () => ({ status: 'created' }),
  jsFilter: (dataset) => dataset.status === 'created'
}, {
  name: 'storeFile',
  eventsPrefix: 'store',
  worker: 'filesManager',
  mongoFilter: () => ({ $or: [{ status: 'loaded' }, { 'draft.status': 'loaded' }] }),
  jsFilter: (dataset) => dataset.status === 'loaded'
}, {
  name: 'downloadFile',
  eventsPrefix: 'download',
  worker: 'filesManager',
  mongoFilter: () => ({ status: 'imported' }),
  jsFilter: (dataset) => dataset.status === 'imported'
}, {
  name: 'analyzeCsv',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), { 'file.mimetype': { $in: csvTypes } }] },
      { $and: [isNormalizedMongoFilter('draft'), { 'draft.file.mimetype': { $in: csvTypes } }] }
    ]
  }),
  jsFilter: (dataset) => isFileDataset(dataset) && isNormalized(dataset) && csvTypes.includes(dataset.file.mimetype)
}, {
  name: 'analyzeGeojson',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isNormalizedMongoFilter(), { 'file.mimetype': 'application/geo+json' }] },
      { $and: [isNormalizedMongoFilter('draft.'), { 'draft.file.mimetype': 'application/geo+json' }] }
    ]
  }),
  jsFilter: (dataset) => isFileDataset(dataset) && isNormalized(dataset) && dataset.file.mimetype === 'application/geo+json'
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), activeExtensionMongoFilter()] },
      { $and: [isValidatedMongoFilter('draft.'), activeExtensionMongoFilter('draft.')] }
    ]
  }),
  jsFilter: (dataset) => isValidated(dataset) && hasActiveExtension(dataset)
}, {
  name: 'indexLines',
  eventsPrefix: 'index',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter(), { $not: activeExtensionMongoFilter() }] },
      { $and: [isValidatedMongoFilter('draft.'), { $not: activeExtensionMongoFilter('draft.') }] },
      { status: 'extended' },
      { 'draft.status': 'extended' },
      { isRest: true, _partialRestStatus: 'extended' }
    ]
  }),
  jsFilter: (dataset) => {
    if (isValidated(dataset) && !hasActiveExtension(dataset)) return true
    if (dataset.status === 'extended') return true
    if (dataset.isRest && dataset._partialRestStatus === 'extended') return true
    return false
  }
}, {
  name: 'normalizeFile',
  eventsPrefix: 'normalize',
  worker: 'filesProcessor',
  mongoFilter: () => ({
    $or: [
      { status: 'finalized', $not: isNormalizedMongoFilter() },
      { 'draft.status': 'finalized', $not: isNormalizedMongoFilter('draft.') }
    ]
  }),
  jsFilter: (dataset) => dataset.status === 'stored' && isFileDataset(dataset) && !isNormalized(dataset)
}, {
  name: 'validateFile',
  eventsPrefix: 'validate',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] } },
      { 'draft.file': { $exists: true }, 'draft.status': { $in: ['analyzed', 'validation-updated'] } }
    ]
  }),
  jsFilter: (dataset) => !!(dataset.file && dataset.status && ['analyzed', 'validation-updated'].includes(dataset.status))
}, {
  name: 'finalize',
  eventsPrefix: 'finalize',
  worker: 'shortProcessor',
  mongoFilter: () => ({ $or: [{ status: 'indexed' }, { 'draft.status': 'indexed' }, { isRest: true, _partialRestStatus: 'indexed' }] }),
  jsFilter: (dataset: DatasetInternal) => dataset.status === 'indexed' || (dataset.isRest && dataset._partialRestStatus === 'indexed')
}, {
  name: 'exportRest',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    status: 'finalized',
    isRest: true,
    'exports.restToCSV.active': true,
    'dataset.exports.restToCSV.nextExport': { $lt: new Date().toISOString() }
  }),
  jsFilter: (dataset) => !!(
    dataset.status === 'finalized' &&
    isRestDataset(dataset) &&
    dataset?.exports?.restToCSV?.active &&
    dataset.exports.restToCSV.nextExport &&
    dataset.exports.restToCSV.nextExport < new Date().toISOString()
  )
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
  }),
  jsFilter: (dataset: DatasetInternal) => (
    (dataset.isMetaOnly || dataset.status === 'finalized') &&
    !dataset.draftReason &&
    dataset.publications?.some(p => ['waiting', 'deleted'].includes(p.status))
  )
}, {
  name: 'renewApiKey',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'readApiKey.active': true, 'readApiKey.renewAt': { $lt: new Date().toISOString() } }),
  jsFilter: (dataset) => !!(
    dataset?.readApiKey?.active &&
    dataset.readApiKey.renewAt &&
    dataset.readApiKey.renewAt < new Date().toISOString()
  )
}, {
  name: 'manageTTL',
  worker: 'shortProcessor',
  mongoFilter: () => ({ status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, $or: [{ 'rest.ttl.checkedAt': { $lt: moment().subtract(1, 'hours').toISOString() } }, { 'rest.ttl.checkedAt': { $exists: false } }] }),
  jsFilter: (dataset) => !!(
    dataset.status === 'finalized' &&
    dataset.isRest && dataset.rest?.ttl?.active &&
    dataset.count &&
    (!dataset.rest.ttl.checkedAt || dataset.rest.ttl.checkedAt < moment().subtract(1, 'hours').toISOString())
  )
}, {
  name: 'autoUpdate',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    'remoteFile.autoUpdate.active': true,
    'dataset.remoteFile.autoUpdate.nextUpdate': { $lt: new Date().toISOString() }
  }),
  jsFilter: (dataset) => !!(dataset.remoteFile?.autoUpdate?.active && dataset.remoteFile.autoUpdate.nextUpdate && dataset.remoteFile.autoUpdate.nextUpdate < new Date().toISOString() && !dataset.draftReason)
}, {
  name: 'errorRetry',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    $or: [
      { status: 'error', errorStatus: { $exists: true }, errorRetry: { $lt: new Date().toISOString() } },
      { 'draft.status': 'error', 'draft.errorStatus': { $exists: true }, 'draft.errorRetry': { $lt: new Date().toISOString() } }
    ]
  }),
  jsFilter: (dataset) => !!(dataset.status === 'error' && dataset.errorStatus && dataset.errorRetry && dataset.errorRetry < new Date().toISOString())
}, {
  name: 'autoUpdateExtension',
  worker: 'shortProcessor',
  mongoFilter: () => ({ status: 'finalized', isRest: true, 'extensions.nextUpdate': { $lt: new Date().toISOString() } }),
  jsFilter: (dataset) => !!(dataset.status === 'finalized' && dataset.isRest && dataset.extensions?.some(e => e.nextUpdate && e.nextUpdate < new Date().toISOString()))
}]

const applicationTasks: ApplicationTask[] = [{
  name: 'publishApplication',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    'publications.status': { $in: ['waiting', 'delete'] }
  }),
  jsFilter: (application) => application.publications?.some(p => ['waiting', 'deleted'].includes(p.status))
}]

const catalogTasks: CatalogTask[] = [{
  name: 'harvest',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'autoUpdate.active': true, 'autoUpdate.nextUpdate': { $lt: new Date().toISOString() } }),
  jsFilter: (catalog) => catalog.autoUpdate?.active && catalog.autoUpdate?.nextUpdate && catalog.autoUpdate?.nextUpdate < new Date().toISOString()
}]

export const tasks = {
  catalogs: catalogTasks,
  datasets: datasetTasks,
  applications: applicationTasks
}
