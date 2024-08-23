const config = /** @type {any} */(require('config'))
const { Histogram } = require('prom-client')
const metrics = require('../misc/utils/metrics')
const locks = require('../misc/utils/locks')
const debug = require('debug')('workers')
const mergeDraft = require('../datasets/utils/merge-draft')
const { schemaHasValidationRules } = require('../datasets/utils/schema')

const workersTasksHistogram = new Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status']
})

const tasks = exports.tasks = {
  initializer: require('./initializer'),
  fileDownloader: require('./file-downloader'),
  fileStorer: require('./file-storer'),
  fileNormalizer: require('./file-normalizer'),
  csvAnalyzer: require('./csv-analyzer'),
  geojsonAnalyzer: require('./geojson-analyzer'),
  fileValidator: require('./file-validator'),
  extender: require('./extender'),
  indexer: require('./indexer'),
  finalizer: require('./finalizer'),
  datasetPublisher: require('./dataset-publisher'),
  ttlManager: require('./ttl-manager'),
  restExporterCSV: require('./rest-exporter-csv'),
  applicationPublisher: require('./application-publisher'),
  catalogHarvester: require('./catalog-harvester'),
  readApiKeyRenewer: require('./read-api-key-renewer')
}

// resolve functions that will be filled when we will be asked to stop the workers
// const stopResolves = {}
let stopped = false
const promisePool = []
/** @type {null | ((value?: any) => void)} */
let loopIntervalPromiseResolve = null

// Hooks for testing
let hooks = {}
exports.hook = (key, delay = 15000, message) => {
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
exports.clear = async () => {
  hooks = {}
  try {
    await Promise.all(promisePool.filter(p => !!p))
  } catch (err) {
    // nothing : we left it pending in tests, we must not care about the result
    console.log('error when clearing worker promise pull', err)
  }
}

exports.runningTasks = () => {
  return promisePool.filter(p => !!p).map(p => p._resource)
}

/* eslint no-unmodified-loop-condition: 0 */
// Run main loop !
exports.start = async (app) => {
  const debugLoop = require('debug')('worker-loop')

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
exports.stop = async () => {
  stopped = true
  console.log('waiting for worker loop to finish current tasks')
  await Promise.all(promisePool.filter(p => !!p))
  console.log('all tasks are done')
}

// Filters to select eligible datasets or applications for processing
const getTypesFilters = () => {
  const moment = require('moment')
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
          // fetch datasets that are finalized, but need to update a publication
          { status: 'finalized', 'publications.status': { $in: ['waiting', 'deleted'] } },
          // fetch rest datasets with a TTL to process
          { status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, 'rest.ttl.checkedAt': { $lt: moment().subtract(1, 'hours').toISOString() } },
          { status: 'finalized', count: { $gt: 0 }, isRest: true, 'rest.ttl.active': true, 'rest.ttl.checkedAt': { $exists: false } },
          // fetch rest datasets with an automatic export to do
          { status: 'finalized', isRest: true, 'exports.restToCSV.active': true, 'exports.restToCSV.nextExport': { $lt: new Date().toISOString() } },
          // file datasets with remote url that need refreshing
          { status: { $nin: ['error'] }, 'remoteFile.autoUpdate.active': true, 'remoteFile.autoUpdate.nextUpdate': { $lt: new Date().toISOString() } },
          // renew read api key
          { 'readApiKey.active': true, 'readApiKey.renewAt': { $lt: new Date().toISOString() } },
          // fetch datasets that are finalized, but need to update an extension
          { status: 'finalized', isRest: true, 'extensions.nextUpdate': { $lt: new Date().toISOString() } },
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
  const journals = require('../misc/utils/journals')
  const now = new Date().toISOString()

  let taskKey
  let lastStderr = ''
  let endTask
  let hookResolution, hookRejection
  let lockReleaseDelay = 0
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
      const moment = require('moment')

      const normalized = (resource.status === 'stored' && tasks.fileNormalizer.basicTypes.includes(resource.originalFile?.mimetype)) || resource.status === 'normalized'

      if (resource.status === 'created') {
        // Initialize a dataset
        taskKey = 'initializer'
      } else if (resource.status === 'imported' || (resource.remoteFile?.autoUpdate?.active && resource.remoteFile.autoUpdate.nextUpdate < now)) {
        // Load a dataset from a catalog
        taskKey = 'fileDownloader'
      } else if (resource.status === 'loaded') {
        // File was either uploaded or downloded, it needs to be copied to the storage
        taskKey = 'fileStorer'
      } else if (resource.status === 'stored' && !normalized) {
        // XLS to csv of other transformations
        taskKey = 'fileNormalizer'
      } else if (normalized && resource.file && tasks.fileNormalizer.csvTypes.includes(resource.file.mimetype)) {
        // Quickly parse a CSV file
        taskKey = 'csvAnalyzer'
      } else if (normalized && resource.file && resource.file.mimetype === 'application/geo+json') {
        // Deduce a schema from geojson properties
        taskKey = 'geojsonAnalyzer'
      } else if (resource.isRest && resource.status === 'extended-updated') {
        taskKey = 'indexer'
      } else if (resource.file && ['analyzed', 'validation-updated'].includes(resource.status)) {
        taskKey = 'fileValidator'
      } else if ((resource.file && resource.status === 'validated') || (resource.isRest && ['analyzed', 'updated'].includes(resource.status))) {
        if (resource.extensions && resource.extensions.find(e => e.active)) {
          // Perform extensions from remote services for dataset that have at least one active extension
          taskKey = 'extender'
        } else {
          // index the content of the dataset in ES
          // either just analyzed or an updated REST dataset
          taskKey = 'indexer'
        }
      } else if (resource.status === 'extended') {
        taskKey = 'indexer'
      } else if (resource.status === 'indexed') {
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
      }
    }

    if (!taskKey) return
    const task = tasks[taskKey]
    debug(`run task ${taskKey} - ${type} / ${resource.slug} (${resource.id})${resource.draftReason ? ' - draft' : ''}`)

    if (task.eventsPrefix) {
      const noStoreEvent = type === 'dataset'
      await journals.log(app, resource, { type: task.eventsPrefix + '-start' }, type, noStoreEvent)
    }

    endTask = workersTasksHistogram.startTimer({ task: taskKey })
    if (config.worker.spawnTask) {
      // Run a task in a dedicated child process for  extra resiliency to fatal memory exceptions
      const spawn = require('child-process-promise').spawn
      const spawnPromise = spawn('node', ['server', taskKey, type, resource.id], { env: { ...process.env, DEBUG: '', MODE: 'task', DATASET_DRAFT: '' + !!resource.draftReason } })
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
      const noStoreEvent = type === 'dataset' && task.eventsPrefix !== 'finalize'
      if (resource.draftReason) {
        await journals.log(app, mergeDraft({ ...newResource }), { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      } else {
        await journals.log(app, newResource, { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      }
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

    if (retry) {
      debug('retry task after lock release delay', config.worker.errorRetryDelay)
      await journals.log(app, resource, { type: 'error-retry', data: errorMessage }, type)
      // do not change the resource so that the task can be attempted again
      // we use the lock system to postpone the retry
      lockReleaseDelay = config.worker.errorRetryDelay
    } else {
      debug('do NOT retry the task, mark the resource status as error')
      await journals.log(app, resource, { type: 'error', data: errorMessage }, type)
      await app.get('db').collection(type + 's').updateOne({ id: resource.id }, { $set: {
        [resource.draftReason ? 'draft.status' : 'status']: 'error' },
        [resource.draftReason ? 'draft.errorStatus' : 'errorStatus']: 'resource.status' }
      })
      resource.status = 'error'
    }
    hookRejection = { resource, message: errorMessage }
  } finally {
    await locks.release(db, `${type}:${resource.id}`, lockReleaseDelay)
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
    // console.log('resource', resource)
    const ack = await locks.acquire(db, `${type}:${resource.id}`, 'worker')
    if (!ack) continue
    // check that there was no race condition and that the resource is still in the state required to work on it
    const updatedResource = await db.collection(type + 's').findOne({ ...filter, id: resource.id })
    if (updatedResource) return updatedResource
    else await locks.release(db, `${type}:${resource.id}`)
  }
}
