const config = require('config')
const locks = require('../utils/locks')
const prometheus = require('../utils/prometheus')
const debug = require('debug')('workers')

const tasks = exports.tasks = {
  downloader: require('./downloader'),
  converter: require('./converter'),
  csvAnalyzer: require('./csv-analyzer'),
  geojsonAnalyzer: require('./geojson-analyzer'),
  indexer: require('./indexer'),
  extender: require('./extender'),
  finalizer: require('./finalizer'),
  datasetPublisher: require('./dataset-publisher'),
  ttlManager: require('./ttl-manager'),
  restExporterCSV: require('./rest-exporter-csv'),
  applicationPublisher: require('./application-publisher')
}

// resolve functions that will be filled when we will be asked to stop the workers
// const stopResolves = {}
let stopped = false
const promisePool = []

// Hooks for testing
let hooks = {}
exports.hook = (key, delay = 15000, message) => {
  message = message || `time limit on worker hook - ${key}`
  const promise = new Promise((resolve, reject) => {
    hooks[key] = { resolve, reject }
  })
  const error = new Error(message) // prepare error at this level so that stack trace is useful
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
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
      await new Promise(resolve => setTimeout(resolve, config.worker.interval))
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
    if (stopped) continue
    resource = await acquireNext(db, 'dataset', typesFilters().dataset)
    type = 'dataset'
    if (!resource) {
      if (stopped) continue
      resource = await acquireNext(db, 'application', typesFilters().application)
      type = 'application'
    }
    if (!resource) {
      active = false
      continue
    } else {
      debugLoop('work on resource', type, resource.id)
      active = true
    }

    if (stopped) continue
    promisePool[freeSlot] = iter(app, resource, type)
    promisePool[freeSlot].catch(err => {
      prometheus.internalError.inc({ errorCode: 'worker-iter' })
      console.error('(worker-iter) error in worker iter', err)
    })
    // always empty the slot after the promise is finished
    promisePool[freeSlot].finally(() => {
      promisePool[freeSlot] = null
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
const typesFilters = () => {
  const moment = require('moment')
  return {
    application: { 'publications.status': { $in: ['waiting', 'deleted'] } },
    dataset: {
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
        { status: 'finalized', isRest: true, 'exports.restToCSV.active': true, 'exports.restToCSV.nextExport': { $lt: new Date().toISOString() } }
      ]
    }
  }
}

async function iter (app, resource, type) {
  const db = app.get('db')
  const journals = require('../utils/journals')

  let taskKey
  let lastStderr = ''
  let endTask
  let hookResolution, hookRejection
  try {
    // if there is something to be done in the draft mode of the dataset, it is prioritary
    if (type === 'dataset' && resource.draft && resource.draft.status !== 'finalized' && resource.draft.status !== 'error') {
      const datasetUtils = require('../utils/dataset')
      datasetUtils.mergeDraft(resource)
    }

    // REST datasets trigger too many events
    let noStoreEvent = false
    if (type === 'dataset' && resource.isRest && resource.finalizedAt) {
      const journal = (await db.collection('journals')
        .findOne({ id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id }, { projection: { events: { $slice: -1 } } }))
      const lastEvent = journal && journal.events[0]
      if (lastEvent && lastEvent.type === 'finalize-end') noStoreEvent = true
    }
    if (type === 'application') {
      // Not much to do on applications.. Just catalog publication
      taskKey = 'applicationPublisher'
    } else if (type === 'dataset') {
      const moment = require('moment')
      if (resource.status === 'imported') {
        // Load a dataset from a catalog
        taskKey = 'downloader'
      } else if (resource.status === 'uploaded') {
        // XLS to csv of other transformations
        taskKey = 'converter'
      } else if (resource.status === 'loaded' && resource.file && tasks.converter.csvTypes.includes(resource.file.mimetype)) {
        // Quickly parse a CSV file
        taskKey = 'csvAnalyzer'
      } else if (resource.status === 'loaded' && resource.file && resource.file.mimetype === 'application/geo+json') {
        // Deduce a schema from geojson properties
        taskKey = 'geojsonAnalyzer'
      } else if (resource.isRest && resource.status === 'extended-updated') {
        taskKey = 'indexer'
      } else if (resource.status === 'analyzed' || (resource.isRest && resource.status === 'updated')) {
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
        // either extended or there are no extensions to perform
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
        resource.exports.restToCSV.nextExport < new Date().toISOString()
      ) {
        taskKey = 'restExporterCSV'
      }
    }
    if (!taskKey) return
    const task = tasks[taskKey]
    debug(`run task ${taskKey} - ${type} / ${resource.id}`)

    if (task.eventsPrefix) await journals.log(app, resource, { type: task.eventsPrefix + '-start' }, type, noStoreEvent)

    endTask = prometheus.workersTasks.startTimer({ task: taskKey })
    if (config.worker.spawnTask) {
      // Run a task in a dedicated child process for  extra resiliency to fatal memory exceptions
      const spawn = require('child-process-promise').spawn
      const spawnPromise = spawn('node', ['server', taskKey, type, resource.id], { env: { ...process.env, DEBUG: '', MODE: 'task', DATASET_DRAFT: '' + !!resource.draftReason } })
      spawnPromise.childProcess.stdout.on('data', data => {
        data = data.toString()
        debug('[spawned task stdout] ' + data)
        lastStderr = ''
        if (stopped) console.log('[spawned task stdout after stopping]', data)
      })
      spawnPromise.childProcess.stderr.on('data', data => {
        data = data.toString()
        debug('[spawned task stderr] ' + data)
        lastStderr += data
        if (stopped) console.log('[spawned task stderr after stopping]', data)
      })
      await spawnPromise
    } else {
      await task.process(app, resource)
    }
    endTask({ status: 'ok' })
    debug(`finished task ${taskKey} - ${type} / ${resource.id}`)

    const newResource = await app.get('db').collection(type + 's').findOne({ id: resource.id })
    if (task.eventsPrefix && newResource) {
      const datasetUtils = require('../utils/dataset')
      if (resource.draftReason) {
        await journals.log(app, datasetUtils.mergeDraft({ ...newResource }), { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      } else {
        await journals.log(app, newResource, { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
      }
    }
    hookResolution = newResource
  } catch (err) {
    // Build back the original error message from the stderr of the child process
    const errorMessage = []
    if (lastStderr) {
      for (const line of lastStderr.split('\n')) {
        if (line && !line.includes('Warning:') && !line.includes('--trace-warnings') && !line.startsWith('worker:')) {
          errorMessage.push(line)
        }
      }
    } else {
      errorMessage.push(err.message)
    }

    if (stopped) {
      console.log('task failed while service was shutting down', errorMessage)
      if (endTask) endTask({ status: 'interrupted' })
      return
    }

    if (endTask) endTask({ status: 'error' })

    prometheus.internalError.inc({ errorCode: 'task' })

    console.warn(`failure in worker ${taskKey} - ${type} / ${resource.id}`, err, errorMessage)
    await journals.log(app, resource, { type: 'error', data: errorMessage.join('\n') }, type)
    await app.get('db').collection(type + 's').updateOne({ id: resource.id }, { $set: { [resource.draftReason ? 'draft.status' : 'status']: 'error' } })
    resource.status = 'error'
    hookRejection = { resource, message: errorMessage.join('\n') }
  } finally {
    await locks.release(db, `${type}:${resource.id}`)
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
  const cursor = db.collection(type + 's').aggregate([{ $match: filter }, { $sample: { size: 100 } }])
  while (await cursor.hasNext()) {
    const resource = await cursor.next()
    // console.log('resource', resource)
    const ack = await locks.acquire(db, `${type}:${resource.id}`, 'worker')
    if (ack) return resource
  }
}
