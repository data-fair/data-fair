import config from '#config'
import { Histogram } from 'prom-client'
import * as metrics from '../misc/utils/metrics.js'
import locks from '@data-fair/lib-node/locks.js'
import * as journals from '../misc/utils/journals.js'
import debug from 'debug'
import mergeDraft from '../datasets/utils/merge-draft.js'
import taskProgress from '../datasets/utils/task-progress.js'
import { basicTypes, csvTypes } from '../datasets/utils/types.js'
import moment from 'moment'
import { spawn } from 'child-process-promise'

const workersTasksHistogram = new Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status']
})

export const tasks = {
  initializer: async () => import('./initializer.js'),
  fileDownloader: async () => import('./file-downloader.js'),
  fileStorer: async () => import('./file-storer.js'),
  fileNormalizer: async () => import('./file-normalizer.js'),
  csvAnalyzer: async () => import('./csv-analyzer.js'),
  geojsonAnalyzer: async () => import('./geojson-analyzer.js'),
  fileValidator: async () => import('./file-validator.js'),
  extender: async () => import('./extender.js'),
  indexer: async () => import('./indexer.js'),
  finalizer: async () => import('./finalizer.js'),
  datasetPublisher: async () => import('./dataset-publisher.js'),
  ttlManager: async () => import('./ttl-manager.js'),
  restExporterCSV: async () => import('./rest-exporter-csv.js'),
  applicationPublisher: async () => import('./application-publisher.js'),
  catalogHarvester: async () => import('./catalog-harvester.js'),
  readApiKeyRenewer: async () => import('./read-api-key-renewer.js')
}

// resolve functions that will be filled when we will be asked to stop the workers
// const stopResolves = {}
let stopped = false
const promisePool = []
/** @type {null | ((value?: any) => void)} */
let loopIntervalPromiseResolve = null

// Hooks for testing
let hooks = {}
export const hook = (key, delay = 15000, message) => {
  message = message || `time limit on worker hook - ${key}`
  const promise = new Promise((resolve, reject) => {
    hooks[key] = { resolve, reject }
  })
  const error = new Error(message) // prepare error at this level so that stack trace is useful
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
  if (loopIntervalPromiseResolve) loopIntervalPromiseResolve()
  return Promise.race([promise, timeoutPromise])
}
// clear also for testing
export const clear = async () => {
  hooks = {}
  try {
    await Promise.all(promisePool.filter(p => !!p))
  } catch (err) {
    // nothing : we left it pending in tests, we must not care about the result
    console.log('error when clearing worker promise pull', err)
  }
}

export const runningTasks = () => {
  return promisePool.filter(p => !!p).map(p => p._resource)
}

/* eslint no-unmodified-loop-condition: 0 */
// Run main loop !
export const start = async (app) => {
  const debugLoop = debug('worker-loop')

  debugLoop('start worker loop with config', config.worker)
  const db = app.get('db')

  // initialize empty promise pool
  for (let i = 0; i < config.worker.concurrency; i++) {
    promisePool[i] = null
  }
  let active = true

  while (!stopped) {
    if (!active) {
      // polling interval is ignored while we are actively working on resources
      await new Promise(resolve => {
        loopIntervalPromiseResolve = resolve
        setTimeout(resolve, config.worker.interval)
      })
      loopIntervalPromiseResolve = null
    }

    let resource, type
    // wait for an available spot in the promise pool
    if (!promisePool.includes(null)) {
      debugLoop('pool is full, wait for a free spot')
      await Promise.any(promisePool)
    }
    const freeSlot = promisePool.findIndex(p => !p)
    debugLoop('free slot', freeSlot)

    // once we have a free slot, acquire the next resource to work on
    const typesFilters = getTypesFilters()
    for (const resourceType of Object.keys(typesFilters)) {
      if (stopped) break
      resource = await acquireNext(db, resourceType, typesFilters[resourceType])
      type = resourceType
      if (resource) break
    }
    if (stopped) continue

    if (!resource) {
      active = false
      continue
    } else {
      debugLoop('work on resource', type, resource.id)
      active = true
    }

    if (stopped) continue
    promisePool[freeSlot] = iter(app, resource, type)
    promisePool[freeSlot]._resource = `${type}/${resource.id} (${resource.slug}) - ${resource.status}`
    promisePool[freeSlot].catch(err => {
      metrics.internalError('worker-iter', err)
    })
    // always empty the slot after the promise is finished
    promisePool[freeSlot].finally(() => {
      promisePool[freeSlot] = null
      if (loopIntervalPromiseResolve) {
        debugLoop('slot is freed, shorten interval waiting')
        loopIntervalPromiseResolve()
      }
    })
  }
}

// Stop and wait for all workers to finish their current task
export const stop = async () => {
  stopped = true
  console.log('waiting for worker loop to finish current tasks')
  await Promise.all(promisePool.filter(p => !!p))
  console.log('all tasks are done')
}

// Filters to select eligible datasets or applications for processing
const getTypesFilters = () => {
  const date = new Date().toISOString()
  return {
    application: { 'publications.status': { $in: ['waiting', 'deleted'] } },
    catalog: {
      'autoUpdate.active': true, 'autoUpdate.nextUpdate': { $lt: new Date().toISOString() }
    },
    dataset: {
      $or: [{
        isMetaOnly: { $ne: true },
        $or: [
          // fetch next processing steps in usual sequence
          { status: { $nin: ['finalized', 'error', 'draft'] } },
          // fetch next processing steps in usual sequence, but of the draft version of the dataset
          { 'draft.status': { $exists: true, $nin: ['finalized', 'error'] } },
          // fetch rest datasets with a partial update
          { status: 'finalized', isRest: true, _partialRestStatus: { $exists: true } },
          // fetch datasets that are finalized, but need to update a publications
          { status: 'finalized', 'publications.status': { $in: ['waiting', 'deleted'] } },
          // fetch rest datasets with a TTL to process
          { status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, 'rest.ttl.checkedAt': { $lt: moment().subtract(1, 'hours').toISOString() } },
          { status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, 'rest.ttl.checkedAt': { $exists: false } },
          // fetch rest datasets with an automatic export to do
          { status: 'finalized', isRest: true, 'exports.restToCSV.active': true, 'exports.restToCSV.nextExport': { $lt: date } },
          // file datasets with remote url that need refreshing
          { status: 'finalized', draft: { $exists: false }, 'remoteFile.autoUpdate.active': true, 'remoteFile.autoUpdate.nextUpdate': { $lt: date } },
          // renew read api key
          { 'readApiKey.active': true, 'readApiKey.renewAt': { $lt: date } },
          // manage error retry
          { status: 'error', errorStatus: { $exists: true }, errorRetry: { $exists: true, $lt: date } },
          { 'draft.status': 'error', 'draft.errorStatus': { $exists: true }, 'draft.errorRetry': { $exists: true, $lt: date } },
          // fetch datasets that are finalized, but need to update an extension
          { status: 'finalized', isRest: true, 'extensions.nextUpdate': { $lt: date } },
          { status: 'finalized', isRest: true, 'extensions.needsUpdate': true }
        ]
      }, {
        isMetaOnly: true,
        'publications.status': { $in: ['waiting', 'deleted'] }
      }]
    }
  }
}

async function iter (app, resource, type) {
  const db = app.get('db')
  const now = new Date().toISOString()

  let taskKey
  let lastStderr = ''
  let endTask
  let hookResolution, hookRejection
  let progress
  try {
    // if there is something to be done in the draft mode of the dataset, it is prioritary
    if (type === 'dataset' && resource.draft && resource.draft.status !== 'finalized' && resource.draft.status !== 'error') {
      mergeDraft(resource)
    }

    if (type === 'application') {
      // Not much to do on applications.. Just catalog publication
      taskKey = 'applicationPublisher'
    } else if (type === 'catalog') {
      taskKey = 'catalogHarvester'
    } else if (type === 'dataset') {
      const normalized = (resource.status === 'stored' && basicTypes.includes(resource.originalFile?.mimetype)) || resource.status === 'normalized'

      if (resource.status === 'created') {
        // Initialize a dataset
        taskKey = 'initializer'
      } else if (resource.status === 'imported') {
        // Load a dataset from a catalog
        taskKey = 'fileDownloader'
      } else if (resource.remoteFile?.autoUpdate?.active && resource.remoteFile.autoUpdate.nextUpdate < now && !resource.draftReason && !resource.draft) {
        const draft = {
          status: 'imported',
          draftReason: { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant', validationMode: 'always' }
        }
        await db.collection('datasets').updateOne({ id: resource.id }, { $set: { draft } })
      } else if (resource.status === 'loaded') {
        // File was either uploaded or downloded, it needs to be copied to the storage
        taskKey = 'fileStorer'
      } else if (resource.status === 'stored' && !normalized) {
        // XLS to csv of other transformations
        taskKey = 'fileNormalizer'
      } else if (normalized && resource.file && csvTypes.includes(resource.file.mimetype)) {
        // Quickly parse a CSV file
        taskKey = 'csvAnalyzer'
      } else if (normalized && resource.file && resource.file.mimetype === 'application/geo+json') {
        // Deduce a schema from geojson properties
        taskKey = 'geojsonAnalyzer'
      } else if (resource.file && ['analyzed', 'validation-updated'].includes(resource.status)) {
        taskKey = 'fileValidator'
      } else if ((resource.file && resource.status === 'validated') || (resource.isRest && resource.status === 'analyzed') || (resource.isRest && resource._partialRestStatus === 'updated')) {
        if (resource.extensions && resource.extensions.find(e => e.active)) {
          // Perform extensions from remote services for dataset that have at least one active extension
          taskKey = 'extender'
        } else {
          // index the content of the dataset in ES
          // either just analyzed or an updated REST dataset
          taskKey = 'indexer'
        }
      } else if (resource.status === 'extended' || (resource.isRest && resource._partialRestStatus === 'extended')) {
        taskKey = 'indexer'
      } else if (resource.status === 'indexed' || (resource.isRest && resource._partialRestStatus === 'indexed')) {
        // finalization covers some metadata enrichment, schema cleanup, etc.
        taskKey = 'finalizer'
      } else if (
        (resource.isMetaOnly || resource.status === 'finalized') &&
        !resource.draftReason &&
        resource.publications &&
        resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))
      ) {
        // dataset that are finalized can be published if requested
        taskKey = 'datasetPublisher'
      } else if (
        resource.status === 'finalized' &&
        resource.isRest && resource.rest && resource.rest.ttl && resource.rest.ttl.active &&
        resource.count &&
        (!resource.rest.ttl.checkedAt || resource.rest.ttl.checkedAt < moment().subtract(1, 'hours').toISOString())
      ) {
        taskKey = 'ttlManager'
      } else if (
        resource.status === 'finalized' &&
        resource.isRest && resource?.exports?.restToCSV?.active &&
        resource.exports.restToCSV.nextExport < now
      ) {
        taskKey = 'restExporterCSV'
      } else if (
        resource?.readApiKey?.active &&
        resource.readApiKey.renewAt < now
      ) {
        taskKey = 'readApiKeyRenewer'
      } else if (resource.status === 'finalized' && resource.isRest && resource.extensions?.find(e => e.needsUpdate)) {
        taskKey = 'extender'
      } else if (resource.status === 'finalized' && resource.isRest && resource.extensions?.find(e => e.nextUpdate && e.nextUpdate < now)) {
        const extensions = [...resource.extensions]
        for (const e of extensions) {
          if (e.nextUpdate && e.nextUpdate < now) {
            e.needsUpdate = true
            delete e.nextUpdate
          }
        }
        await db.collection('datasets').updateOne({ id: resource.id }, { $set: { extensions } })
      } else if (resource.status === 'error' && resource.errorStatus && resource.errorRetry && resource.errorRetry < now) {
        const propertyPrefix = resource.draftReason ? 'draft.' : ''
        const patch = {
          $set: {
            [propertyPrefix + 'status']: resource.errorStatus
          },
          $unset: {
            [propertyPrefix + 'errorStatus']: 1,
            [propertyPrefix + 'errorRetry']: 1
          }
        }
        await db.collection('datasets').updateOne({ id: resource.id }, patch)
      }
    }

    if (!taskKey) return
    const task = await tasks[taskKey]()
    debug(`run task ${taskKey} - ${type} / ${resource.slug} (${resource.id})${resource.draftReason ? ' - draft' : ''}`)

    if (task.eventsPrefix) {
      const noStoreEvent = type === 'dataset'
      await journals.log(app, resource, { type: task.eventsPrefix + '-start' }, type, noStoreEvent)
      progress = taskProgress(app, resource.id, task.eventsPrefix)
      await progress.start()
    }

    endTask = workersTasksHistogram.startTimer({ task: taskKey })
    if (config.worker.spawnTask) {
      // Run a task in a dedicated child process for  extra resiliency to fatal memory exceptions
      const spawnPromise = spawn('node', ['--experimental-strip-types', 'server/index.ts', taskKey, type, resource.id], { env: { ...process.env, DEBUG: '', MODE: 'task', DATASET_DRAFT: '' + !!resource.draftReason } })
      spawnPromise.childProcess.stdout.on('data', data => {
        data = data.toString()
        console.log(`[${type}/${resource.id}/${taskKey}/stdout] ${data}`)
        lastStderr = ''
        if (stopped) console.error(`[spawn/${type}/${resource.id}/${taskKey}/stdout] AFTER STOP ${data}`)
      })
      spawnPromise.childProcess.stderr.on('data', data => {
        data = data.toString()
        console.error(`[${type}/${resource.id}/${taskKey}/stderr] ${data}`)
        lastStderr += data
        if (stopped) console.error(`[spawn/${type}/${resource.id}/${taskKey}/stdout] AFTER STOP ${data}`)
      })
      await spawnPromise
    } else {
      await task.process(app, resource)
    }
    endTask({ status: 'ok' })
    debug(`finished task ${taskKey} - ${type} / ${resource.slug} (${resource.id})${resource.draftReason ? ' - draft' : ''}`)

    const newResource = await app.get('db').collection(type + 's').findOne({ id: resource.id })
    if (task.eventsPrefix && newResource) {
      const noStoreEvent = type === 'dataset' && (task.eventsPrefix !== 'finalize' || !!resource._partialRestStatus)
      if (resource.draftReason) {
        await journals.log(app, mergeDraft({ ...newResource }), { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      } else {
        await journals.log(app, newResource, { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      }
      await progress?.end()
    }
    hookResolution = newResource
  } catch (err) {
    // Build back the original error message from the stderr of the child process
    let errorMessage
    if (lastStderr) {
      const errorLines = []
      for (const line of lastStderr.split('\n')) {
        if (line && !line.includes('Warning:') && !line.includes('--trace-warnings') && !line.startsWith('worker:')) {
          errorLines.push(line)
        }
      }
      errorMessage = errorLines.join('\n')
    } else {
      errorMessage = err.message
    }

    if (stopped) {
      console.log('task failed while service was shutting down', errorMessage)
      if (endTask) endTask({ status: 'interrupted' })
      return
    }

    if (endTask) endTask({ status: 'error' })

    // metrics.internalError('task', errorMessage)

    console.warn(`failure in worker ${taskKey} - ${type} / ${resource.slug} (${resource.id})`, errorMessage)
    if (!config.worker.spawnTask || !errorMessage) console.debug(err)

    // some error are caused by bad input, we should not retry these
    let retry = !errorMessage.startsWith('[noretry] ') && !!config.worker.errorRetryDelay
    if (!retry) {
      debug('error message started by [noretry]')
      errorMessage = errorMessage.replace('[noretry] ', '')
    }
    if (retry) {
      // if this is the second time we get this error, do not retry anymore
      const hasErrorRetry = await journals.hasErrorRetry(db, resource, type)
      debug('does the journal have a recent error-retry event', hasErrorRetry)
      if (hasErrorRetry) {
        debug('last log in journal was already a retry')
        retry = false
      }
    }

    await progress?.end(true)

    const propertyPrefix = resource.draftReason ? 'draft.' : ''
    const patch = {
      $set: {
        [propertyPrefix + 'status']: 'error',
        [propertyPrefix + 'errorStatus']: resource.status
      }
    }
    if (retry) {
      await journals.log(app, resource, { type: 'error-retry', data: errorMessage }, type)
      patch.$set[propertyPrefix + 'errorRetry'] = new Date((new Date()).getTime() + config.worker.errorRetryDelay).toISOString()
    } else {
      await journals.log(app, resource, { type: 'error', data: errorMessage }, type)
      patch.$unset = { [propertyPrefix + 'errorRetry']: 1 }
    }

    await app.get('db').collection(type + 's').updateOne({ id: resource.id }, patch)
    resource.status = 'error'
    resource.errorStatus = resource.status
    hookRejection = { resource, message: errorMessage }
  } finally {
    await locks.release(`${type}:${resource.id}`)
    if (hookRejection) {
      if (hooks[taskKey]) hooks[taskKey].reject(hookRejection)
      if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].reject(hookRejection)
      if (hooks['finalizer/' + resource.id]) hooks['finalizer/' + resource.id].reject(hookRejection)
    }
    if (hookResolution) {
      if (hooks[taskKey]) hooks[taskKey].resolve(hookResolution)
      if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].resolve(hookResolution)
    }
  }
}

async function acquireNext (db, type, filter) {
  // Random sort prevents from insisting on the same failed dataset again and again
  const cursor = db.collection(type + 's').aggregate([{ $match: filter }, { $project: { id: 1 } }, { $sample: { size: 100 } }])
  while (await cursor.hasNext()) {
    const resource = await cursor.next()
    const ack = await locks.acquire(`${type}:${resource.id}`, 'worker')
    if (!ack) continue
    // check that there was no race condition and that the resource is still in the state required to work on it
    const updatedResource = await db.collection(type + 's').findOne({ ...filter, id: resource.id })
    if (updatedResource) return updatedResource
    else await locks.release(`${type}:${resource.id}`)
  }
}
