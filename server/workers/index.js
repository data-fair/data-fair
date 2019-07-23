const config = require('config')
const spawn = require('child-process-promise').spawn
const locks = require('../utils/locks')
const journals = require('../utils/journals')

const tasks = exports.tasks = {
  downloader: require('./downloader'),
  converter: require('./converter'),
  csvAnalyzer: require('./csv-analyzer'),
  geojsonAnalyzer: require('./geojson-analyzer'),
  csvSchematizer: require('./csv-schematizer'),
  indexer: require('./indexer'),
  extender: require('./extender'),
  finalizer: require('./finalizer'),
  datasetPublisher: require('./dataset-publisher'),
  applicationPublisher: require('./application-publisher')
}

// resolve functions that will be filled when we will be asked to stop the workers
// const stopResolves = {}
let stopped = false
const currentIters = []

// Hooks for testing
const hooks = {}
exports.hook = (key) => new Promise((resolve, reject) => {
  hooks[key] = { resolve, reject }
})

/* eslint no-unmodified-loop-condition: 0 */
// Run main loop !
exports.start = async (app) => {
  while (!stopped) {
    // Maintain max concurrency by checking if there is a free spot in an array of promises
    for (let i = 0; i < config.worker.concurrency; i++) {
      if (currentIters[i]) continue
      currentIters[i] = Promise.all([iter(app, 'dataset'), iter(app, 'application')])
      currentIters[i].finally(() => {
        currentIters[i] = null
      })
    }

    await new Promise(resolve => setTimeout(resolve, config.worker.interval))
  }
}

// Stop and wait for all workers to finish their current task
exports.stop = async () => {
  stopped = true
  await Promise.all(currentIters.filter(p => !!p))
  await new Promise(resolve => setTimeout(resolve, config.worker.releaseInterval))
}

// Filters to select eligible datasets or applications for processing
const typesFilters = {
  application: { 'publications.status': { $in: ['waiting', 'deleted'] } },
  dataset: {
    $or: [
      { status: { $nin: ['finalized', 'error'] } },
      { status: 'finalized', 'publications.status': { $in: ['waiting', 'deleted'] } }
    ]
  }
}

async function iter(app, type) {
  let resource, taskKey
  let stderr = ''
  try {
    resource = await acquireNext(app.get('db'), type, typesFilters[type])
    if (!resource) return

    // REST datasets trigger too many events
    const noStoreEvent = type === 'dataset' && resource.isRest && resource.finalizedAt

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
      } else if (resource.status === 'analyzed' && resource.file && resource.file.mimetype === 'text/csv') {
        // Deduce a schema from CSV structure
        taskKey = 'csvSchematizer'
      } else if (resource.status === 'loaded' && resource.file && resource.file.mimetype === 'application/geo+json') {
        // Deduce a schema from geojson properties
        taskKey = 'geojsonAnalyzer'
      } else if (resource.status === 'schematized' || (resource.isRest && resource.status === 'updated')) {
        // index the content of the dataset in ES
        // either just schematized or an updated REST dataset
        taskKey = 'indexer'
      } else if (resource.status === 'indexed' && resource.extensions && resource.extensions.find(e => e.active)) {
        // Perform extensions from remote services for dataset that are
        // indexed and have at least one active extension
        taskKey = 'extender'
      } else if (resource.status === 'indexed' || resource.status === 'extended') {
        // finalization covers some metadata enrichment, schema cleanup, etc.
        // either extended or there are no extensions to perform
        taskKey = 'finalizer'
      } else if (resource.status === 'finalized' && resource.publications && resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))) {
        // dataset that are finalized can be published if requested
        taskKey = 'datasetPublisher'
      }
    }
    if (!taskKey) return
    const task = tasks[taskKey]

    if (task.eventsPrefix) await journals.log(app, resource, { type: task.eventsPrefix + '-start' }, type, noStoreEvent)

    if (config.worker.spawnTask) {
      // Run a task in a dedicated child process for  extra resiliency to fatal memory exceptions
      const spawnPromise = spawn('node', ['server', taskKey, type, resource.id], { env: { ...process.env, DEBUG: '', MODE: 'task' } })
      spawnPromise.childProcess.stdout.on('data', data => process.stdout.write('[spawned task stdout] ' + data))
      spawnPromise.childProcess.stderr.on('data', data => {
        process.stderr.write('[spawned task stderr] ' + data)
        stderr += data
      })
      await spawnPromise
    } else {
      await task.process(app, resource)
    }

    const newResource = await app.get('db').collection(type + 's').findOne({ id: resource.id })
    if (hooks[taskKey]) hooks[taskKey].resolve(newResource)
    if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].resolve(newResource)
    if (task.eventsPrefix) await journals.log(app, newResource, { type: task.eventsPrefix + '-end' }, type, noStoreEvent)
  } catch (err) {
    // Build back the original error message from the stderr of the child process
    const errorMessage = []
    if (stderr) {
      stderr.split('\n').filter(line => !!line && !line.startsWith('worker:')).forEach(line => {
        errorMessage.push(line)
      })
    } else {
      errorMessage.push(err.message)
    }

    console.error('Failure in worker ' + taskKey, err)
    if (resource) {
      await journals.log(app, resource, { type: 'error', data: errorMessage.join('\n') }, type)
      await app.get('db').collection(type + 's').updateOne({ id: resource.id }, { $set: { status: 'error' } })
      resource.status = 'error'
    }
    if (hooks[taskKey]) hooks[taskKey].reject({ resource, message: errorMessage.join('\n') })
    if (hooks[taskKey + '/' + resource.id]) hooks[taskKey + '/' + resource.id].reject({ resource, message: errorMessage.join('\n') })
  } finally {
    if (resource) {
      // we release the worker right away, but we do not release the lock on the dataset
      // this is to prevent working very fast on the same resource in series
      setTimeout(() => {
        locks.release(app.get('db'), `${type}:${resource.id}`)
      }, config.worker.releaseInterval)
    }
    // console.log(`Worker "${worker.eventsPrefix}" released dataset "${dataset.id}"`)
  }
}

async function acquireNext(db, type, filter) {
  // Random sort prevents from insisting on the same failed dataset again and again
  const cursor = db.collection(type + 's').aggregate([{ $match: filter }, { $sample: { size: 100 } }])
  while (await cursor.hasNext()) {
    const resource = await cursor.next()
    const ack = await locks.acquire(db, `${type}:${resource.id}`)
    if (ack) return resource
  }
}
