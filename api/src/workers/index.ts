import path from 'node:path'
import type { ApplicationTask, CatalogTask, DatasetTask } from './types.ts'
import { Piscina } from 'piscina'
import type { FileDataset, DatasetInternal } from '#types'
import { basicTypes, csvTypes } from '../datasets/utils/types.js'
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import moment from 'moment'

const isNormalized = (dataset: FileDataset) =>
  (dataset.status === 'stored' && basicTypes.includes(dataset.originalFile?.mimetype)) || dataset.status === 'normalized'
const isNormalzedMongoFilter = {
  $or: [
    { status: 'stored', 'originalFile.mimetype': { $in: basicTypes } },
    { status: 'normalized' }
  ]
}

const isValidated = (dataset: DatasetInternal) =>
  ((isFileDataset(dataset) && dataset.status === 'validated') || (isRestDataset(dataset) && (dataset.status === 'analyzed' || (dataset as DatasetInternal)._partialRestStatus === 'updated')))
const isValidatedMongoFilter = {
  $or: [
    { file: { $exists: 1 }, status: 'validated' },
    { isRest: true, status: 'analyzed' },
    { isRest: true, _partialRestStatus: 'updated' }
  ]
}
const hasActiveExtension = (dataset: DatasetInternal) => !!dataset.extensions?.some(e => e.active)
const activeExtensionMongoFilter = { 'extensions.active': true }

export const datasetTasks: DatasetTask[] = [{
  name: 'initialize',
  eventsPrefix: 'initialize',
  worker: 'filesManager',
  mongoFilter: () => ({ status: 'created' }),
  jsFilter: (dataset) => dataset.status === 'created'
}, {
  name: 'storeFile',
  eventsPrefix: 'store',
  worker: 'filesManager',
  mongoFilter: () => ({ status: 'loaded' }),
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
  mongoFilter: () => ({ $and: [isNormalzedMongoFilter, { 'file.mimetype': { $in: csvTypes } }] }),
  jsFilter: (dataset) => isFileDataset(dataset) && isNormalized(dataset) && csvTypes.includes(dataset.file.mimetype)
}, {
  name: 'analyzeGeojson',
  eventsPrefix: 'analyze',
  worker: 'filesProcessor',
  mongoFilter: () => ({ $and: [isNormalzedMongoFilter, { 'file.mimetype': 'application/geo+json' }] }),
  jsFilter: (dataset) => isFileDataset(dataset) && isNormalized(dataset) && dataset.file.mimetype === 'application/geo+json'
}, {
  name: 'extend',
  eventsPrefix: 'extend',
  worker: 'batchProcessor',
  mongoFilter: () => ({ $and: [isValidatedMongoFilter, activeExtensionMongoFilter] }),
  jsFilter: (dataset) => isValidated(dataset) && hasActiveExtension(dataset)
}, {
  name: 'indexLines',
  eventsPrefix: 'index',
  worker: 'batchProcessor',
  mongoFilter: () => ({
    $or: [
      { $and: [isValidatedMongoFilter, { $not: activeExtensionMongoFilter }] },
      { status: 'extended' },
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
    status: 'finalized',
    $not: isNormalzedMongoFilter
  }),
  jsFilter: (dataset) => dataset.status === 'stored' && isFileDataset(dataset) && !isNormalized(dataset)
}, {
  name: 'validateFile',
  eventsPrefix: 'validate',
  worker: 'batchProcessor',
  mongoFilter: () => ({ file: { $exists: true }, status: { $in: ['analyzed', 'validation-updated'] } }),
  jsFilter: (dataset) => !!(dataset.file && dataset.status && ['analyzed', 'validation-updated'].includes(dataset.status))
}, {
  name: 'finalize',
  eventsPrefix: 'finalize',
  worker: 'shortProcessor',
  mongoFilter: () => ({ $or: [{ status: 'indexed' }, { isRest: true, _partialRestStatus: 'indexed' }] }),
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
}]

export const applicationTasks: ApplicationTask[] = [{
  name: 'publishApplication',
  worker: 'shortProcessor',
  mongoFilter: () => ({
    'publications.status': { $in: ['waiting', 'delete'] }
  }),
  jsFilter: (application) => application.publications?.some(p => ['waiting', 'deleted'].includes(p.status))
}]

export const catalogTasks: CatalogTask[] = [{
  name: 'harvest',
  worker: 'shortProcessor',
  mongoFilter: () => ({ 'autoUpdate.active': true, 'autoUpdate.nextUpdate': { $lt: new Date().toISOString() } }),
  jsFilter: (catalog) => catalog.autoUpdate?.active && catalog.autoUpdate?.nextUpdate && catalog.autoUpdate?.nextUpdate < new Date().toISOString()
}]

export const workers = {
  // IO based worker for all small-ish tasks that we don't want to be blocked by longer tasks
  shortProcessor: new Piscina({
    filename: path.resolve(import.meta.dirname, './short-processor.ts'),
    minThreads: 0,
    idleTimeout: 60 * 1000,
    maxThreads: 1,
    concurrentTasksPerWorker: 10
  }),
  // mostly IO bound worker for anything that is mostly about moving files, downloading files, etc
  filesManager: new Piscina({
    filename: path.resolve(import.meta.dirname, './files-manager/index.ts'),
    minThreads: 0,
    idleTimeout: 60 * 1000,
    maxThreads: 1,
    concurrentTasksPerWorker: 4
  }),
  // files analysis and normalization can be quite memory and cpu hungry, better to use thread segregation and a small concurrency
  filesProcessor: new Piscina({
    filename: path.resolve(import.meta.dirname, './files-processor/index.ts'),
    minThreads: 0,
    idleTimeout: 60 * 1000,
    maxThreads: 2,
    concurrentTasksPerWorker: 1
  }),
  // a worker that works on large batches of data, mostly IO and sometimes CPU intensive but streamed so memory should be ok
  batchProcessor: new Piscina({
    filename: path.resolve(import.meta.dirname, './batch-processor/index.ts'),
    minThreads: 0,
    idleTimeout: 60 * 1000,
    maxThreads: 2,
    concurrentTasksPerWorker: 2
  })
}
