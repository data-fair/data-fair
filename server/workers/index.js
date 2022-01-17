const config = require('config')
const spawn = require('child-process-promise').spawn
const moment = require('moment')
const locks = require('../utils/locks')
const journals = require('../utils/journals')
const datasetUtils = require('../utils/dataset')
const debug = require('debug')('workers')
const debugLoop = require('debug')('worker-loop')
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
  applicationPublisher: require('./application-publisher'),
}

// resolve functions that will be filled when we will be asked to stop the workers
// const stopResolves = {}
let stopped = false
const promisePool = []

// Hooks for testing
const hooks = {}
exports.hook = (key, delay = 10000, message = 'time limit on worker hook') => {
  const promise = new Promise((resolve, reject) => {
    hooks[key] = { resolve, reject }
  })
  const error = new Error(message) // prepare error at this level so that stack trace is useful
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
  return Promise.race([promise, timeoutPromise])
}
// clear also for testing
exports.clear = () => {
  for (let i = 0; i < config.worker.concurrency; i++) {
    if (promisePool[i]) {
      promisePool[i].catch(() => {})
      delete promisePool[i]
    }
  }
}

/* eslint no-unmodified-loop-condition: 0 */
// Run main loop !
exports.start = async (app) => {
  debugLoop('start worker loop with config', config.worker)
  const db = app.get('db')

  // initialize empty promise pool
  for (let i = 0; i < config.worker.concurrency; i++) {
    promisePool[i] = null
  }
  let lastActivity = new Date().getTime()

  while (!stopped) {
    const now = new Date().getTime()
    if ((now - lastActivity) > config.worker.inactivityDelay) {
      // inactive polling interval
      debugLoop('the worker is inactive wait extra delay', config.worker.inactiveInterval)
      await new Promise(resolve => setTimeout(resolve, config.worker.inactiveInterval))
    } else {
      // base polling interval
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
    resource = await acquireNext(db, 'dataset', typesFilters().dataset)
    type = 'dataset'
    if (!resource) {
      resource = await acquireNext(db, 'application', typesFilters().application)
      type = 'application'
    }
    if (!resource) {
      continue
    } else {
      debugLoop('work on resource', type, resource.id)
      lastActivity = new Date().getTime()
    }

    if (stopped) continue
    promisePool[freeSlot] = iter(app, resource, type)
    promisePool[freeSlot].catch(err => console.error('error in worker iter', err))
    // always empty the slot after the promise is finished
    promisePool[freeSlot].finally(() => {
      promisePool[freeSlot] = null
      // we release the slot right away, but we do not release the lock on the resource
      // this is to prevent working very fast on the same resource in series
      debugLoop('release resource after delay', config.worker.releaseInterval)
      setTimeout(() => locks.release(db, `${type}:${resource.id}`), config.worker.releaseInterval)
    })
  }
}

// Stop and wait for all workers to finish their current task
exports.stop = async () => {
  stopped = true
  await Promise.all(promisePool.filter(p => !!p))
  if (config.worker.releaseInterval) {
    await new Promise(resolve => setTimeout(resolve, config.worker.releaseInterval))
  }
}

// Filters to select eligible datasets or applications for processing
const typesFilters = () => ({
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
      { status: 'finalized', isRest: true, 'exports.restToCSV.active': true, 'exports.restToCSV.nextExport': { $lt: moment().toISOString() } },
    ],
  },
})

async function iter(app, resource, type) {
  const db = app.get('db')
  let taskKey
  let stderr = ''
  try {
    // if there is something to be done in the draft mode of the dataset, it is prioritary
    if (type === 'dataset' && resource.draft && resource.draft.status !== 'finalized' && resource.draft.status !== 'error') {
      datasetUtils.mergeDraft(resource)
    }

    // REST datasets trigger too many events
    let noStoreEvent = false
    if (type === 'dataset' && resource.isRest && resource.finalizedAt) {
      const lastEvent = (await db.collection('journals')
        .findOne({ id: resource.id, type, 'owner.type': resource.owner.type, 'owner.id': resource.owner.id }, { projection: { events: { $slice: -1 } } })).events[0]
      if (lastEvent && lastEvent.type === 'finalize-end') noStoreEvent = true
    }

    if (type === 'application') {
      // Not much to do on applications.. Just catalog publication
      taskKey = 'applicationPublisher'
    } else if (type === 'dataset') {
      if (resource.status === 'imported') {
        // Load a dataset from a catalog
        taskKey = 'downloader'
      } else if (resource.status === 'uploaded') {
        // XLS to csv of other transformations
        taskKey = 'converter'
      } else if (resource.status === 'loaded' && resource.file && resource.file.mimetype === 'text/csv') {
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
        resource.exports.restToCSV.nextExport < moment().toISOString()
      ) {
        taskKey = 'restExporterCSV'
      }
    }
    if (!taskKey) return
    const task = tasks[taskKey]
    debug(`run task ${taskKey} - ${type} / ${resource.id}`)

    if (task.eventsPrefix) await journals.log(app, resource, { type: task.eventsPrefix + '-start' }, type, noStoreEvent)

    if (config.worker.spawnTask) {
      // Run a task in a dedicated child process for  extra resiliency to fatal memory exceptions
      const spawnPromise = spawn('node', ['server', taskKey, type, resource.id], { env: { ...process.env, DEBUG: '', MODE: 'task', DATASET_DRAFT: '' + !!resource.draftReason } })
      spawnPromise.childProcess.stdout.on('data', data => debug('[spawned task stdout] ' + data))
      spawnPromise.childProcess.stderr.on('data', data => {
        debug('[spawned task stderr] ' + data)
        stderr += data
      })
      await spawnPromise
    } else {
      await task.process(app, resource)
    }

    const newResource = await app.get('db').collection(type + 's').findOne({ id: resource.id })
    if (hooks[taskKey]) hooks[taskKey].resolve(JSON.parse(JSON.stringify(newResource)))
    if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].resolve(JSON.parse(JSON.stringify(newResource)))
    if (task.eventsPrefix && newResource) {
      if (resource.draftReason) {
        datasetUtils.mergeDraft(newResource)
      }
      await journals.log(app, newResource, { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
    }
  } catch (err) {
    // Build back the original error message from the stderr of the child process
    const errorMessage = []
    if (stderr) {
      stderr.split('\n')
        .filter(line => !!line)
        .filter(line => !line.includes('Warning:'))
        .filter(line => !line.includes('--trace-warnings'))
        .filter(line => !line.startsWith('worker:'))
        .forEach(line => {
          errorMessage.push(line)
        })
    } else {
      errorMessage.push(err.message)
    }

    if (resource) {
      console.warn(`failure in worker ${taskKey} - ${type} / ${resource.id}`, err)
      await journals.log(app, resource, { type: 'error', data: errorMessage.join('\n') }, type)
      await app.get('db').collection(type + 's').updateOne({ id: resource.id }, { $set: { [resource.draftReason ? 'draft.status' : 'status']: 'error' } })
      resource.status = 'error'
      if (hooks[taskKey]) hooks[taskKey].reject({ resource, message: errorMessage.join('\n') })
      if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].reject({ resource, message: errorMessage.join('\n') })
      if (hooks['finalizer/' + resource.id]) hooks['finalizer/' + resource.id].reject({ resource, message: errorMessage.join('\n') })
    } else {
      console.warn(`failure in worker ${taskKey} - ${type}`, err)
    }
  }
}

async function acquireNext(db, type, filter) {
  // Random sort prevents from insisting on the same failed dataset again and again
  const cursor = db.collection(type + 's').aggregate([{ $match: filter }, { $sample: { size: 100 } }])
  while (await cursor.hasNext()) {
    const resource = await cursor.next()
    // console.log('resource', resource)
    const ack = await locks.acquire(db, `${type}:${resource.id}`)
    if (ack) return resource
  }
}
