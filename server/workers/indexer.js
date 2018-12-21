// Index tabular datasets with elasticsearch using available information on dataset schema
const util = require('util')
const pump = util.promisify(require('pump'))
const { Writable } = require('stream')
const es = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const restDatasetsUtils = require('../utils/rest-datasets')
const extensionsUtils = require('../utils/extensions')
const journals = require('../utils/journals')

exports.eventsPrefix = 'index'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:indexer:${dataset.id}`)

  const db = app.get('db')
  const esClient = app.get('es')
  const collection = db.collection('datasets')

  let indexName
  if (dataset.status === 'updated') {
    indexName = es.aliasName(dataset)
    debug(`Update index ${indexName}`)
  } else {
    indexName = await es.initDatasetIndex(esClient, dataset)
    debug(`Initialize new dataset index ${indexName}`)
  }
  const attachments = !!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  const indexStream = es.indexStream({ esClient, indexName, dataset, attachments })
  // reindex and preserve previous extensions
  debug('Run index stream')
  let readStream, writeStream
  if (dataset.isRest) {
    readStream = restDatasetsUtils.readStream(db, dataset, dataset.status === 'updated')
    writeStream = restDatasetsUtils.markIndexedStream(db, dataset)
  } else {
    readStream = datasetUtils.readStream(dataset)
    writeStream = new Writable({ objectMode: true, write(chunk, encoding, cb) { cb() } })
  }
  await pump(readStream, extensionsUtils.preserveExtensionStream({ db, esClient, dataset, attachments }), indexStream, writeStream)
  debug('index stream ok')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  const result = { status: 'indexed' }
  if (dataset.status === 'updated') {
    result.count = await restDatasetsUtils.count(db, dataset)
  } else {
    debug('Switch alias to point to new datasets index')
    await es.switchAlias(esClient, dataset, indexName)
    result.count = indexStream.i
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (dataset.status === 'updated' && await restDatasetsUtils.count(db, dataset, { _needsIndexing: true })) {
    debug('REST dataset indexed, but some data is still fresh, stay in "updated" status')
    result.status = 'updated'
  }

  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
}
