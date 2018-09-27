const config = require('config')
const locks = require('../utils/locks')
const journals = require('../utils/journals')

const workers = {
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
const stopResolves = {}

// Hooks for testing
const hooks = {}
exports.hook = (key) => new Promise((resolve, reject) => {
  hooks[key] = { resolve, reject }
})

// Run all !
exports.start = (app) => {
  Object.keys(workers).forEach(key => {
    async function loop() {
      if (stopResolves[key]) return stopResolves[key]()
      await iter(app, key)
      setTimeout(loop, config.workers.pollingInterval)
    }

    for (let i = 0; i < config.workers.concurrency; i++) {
      loop()
    }
  })
}

// Stop and wait for all workers to finish their current task
exports.stop = async () => {
  return Promise.all(Object.keys(workers).map(key => new Promise(resolve => { stopResolves[key] = resolve })))
}

async function iter(app, key) {
  const worker = workers[key]
  let resource
  try {
    resource = await acquireNext(app.get('db'), worker.type, worker.filter)
    // console.log(`Worker "${worker.eventsPrefix}" acquired dataset "${dataset.id}"`)
    if (!resource) return
    if (worker.eventsPrefix) await journals.log(app, resource, { type: worker.eventsPrefix + '-start' }, worker.type)
    await worker.process(app, resource)
    if (hooks[key]) hooks[key].resolve(resource)
    if (worker.eventsPrefix) await journals.log(app, resource, { type: worker.eventsPrefix + '-end' }, worker.type)
  } catch (err) {
    console.error('Failure in worker ' + key, err)
    if (resource) {
      await journals.log(app, resource, { type: 'error', data: err.message }, worker.type)
      await app.get('db').collection(worker.type + 's').updateOne({ id: resource.id }, { $set: { status: 'error' } })
      resource.status = 'error'
    }
    if (hooks[key]) hooks[key].reject({ resource, message: err.message })
  } finally {
    if (resource) await locks.release(app.get('db'), `${worker.type}:${resource.id}`)
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
