const config = require('config')
const locks = require('../utils/locks')
const journals = require('../utils/journals')

const workers = {
  analyzer: require('./analyzer'),
  schematizer: require('./schematizer'),
  indexer: require('./indexer')
}

// resolve functions that will be filled when we will be asked to stop the workers
const stopResolves = {}

// Hooks for testing
const hooks = {}
exports.hook = (key) => new Promise((resolve, reject) => {
  hooks[key] = {resolve, reject}
})

// Run all !
exports.start = (app) => {
  Object.keys(workers).forEach(key => loop(app, key))
}

// Stop and wait for all workers to finish their current task
exports.stop = async () => {
  return Promise.all(Object.keys(workers).map(key => new Promise(resolve => { stopResolves[key] = resolve })))
}

async function loop(app, key) {
  if (stopResolves[key]) return stopResolves[key]()
  await iter(app, key)
  setTimeout(() => loop(app, key), config.workers.pollingInterval)
}

async function iter(app, key) {
  const worker = workers[key]
  const dataset = await acquireNext(app.get('db'), worker.filter)
  if (!dataset) return
  console.log(`Worker "${worker.eventsPrefix}" acquired dataset "${dataset.id}"`)
  await journals.log(app, dataset, {type: worker.eventsPrefix + '-start'})
  try {
    await worker.process(app, dataset)
    if (hooks[key]) hooks[key].resolve(dataset)
    await journals.log(app, dataset, {type: worker.eventsPrefix + '-end'})
  } catch (err) {
    console.error('Failure in worker ' + key, err)
    if (hooks[key]) hooks[key].reject(err)
    await journals.log(app, dataset, {type: worker.eventsPrefix + '-fail'})
  } finally {
    await locks.release(app.get('db'), 'dataset:' + dataset.id)
    console.log(`Worker "${worker.eventsPrefix}" released dataset "${dataset.id}"`)
  }
}

async function acquireNext(db, filter) {
  // Random sort prevents from insisting on the same failed dataset again and again
  const cursor = db.collection('datasets').aggregate([{$match: filter}, {$sample: {size: 100}}])
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    const ack = await locks.acquire(db, 'dataset:' + dataset.id)
    if (ack) return dataset
  }
}
