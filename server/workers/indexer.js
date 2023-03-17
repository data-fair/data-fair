const prometheus = require('../utils/prometheus')
const journals = require('../utils/journals')

// Index tabular datasets with elasticsearch using available information on dataset schema
exports.eventsPrefix = 'index'

exports.process = async function (app, dataset) {
  if (process.env.NODE_ENV === 'test' && dataset.id === 'trigger-test-error') {
    throw new Error('This is a test error')
  }

  const pump = require('../utils/pipe')
  const fs = require('fs-extra')
  const { Writable } = require('stream')
  const es = require('../utils/es')
  const datasetUtils = require('../utils/dataset')
  const restDatasetsUtils = require('../utils/rest-datasets')
  const taskProgress = require('../utils/task-progress')

  const debug = require('debug')(`worker:indexer:${dataset.id}`)
  const debugHeap = require('../utils/heap').debug(`worker:indexer:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape indexation.')

  const db = app.get('db')
  const esClient = app.get('es')

  let indexName
  if (dataset.status === 'updated' || dataset.status === 'extended-updated') {
    indexName = es.aliasName(dataset)
    debug(`Update index ${indexName}`)
  } else {
    try {
      indexName = await es.initDatasetIndex(esClient, dataset)
    } catch (err) {
      prometheus.internalError.inc({ errorCode: 'es-init-index' })
      console.error('(es-init-index) elasticsearch init index error', err)
      const message = es.errorMessage(err)
      throw new Error(message)
    }
    debug(`Initialize new dataset index ${indexName}`)
  }
  const attachments = !!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  const indexStream = es.indexStream({ esClient, indexName, dataset, attachments })

  if (!dataset.extensions || dataset.extensions.filter(e => e.active).length === 0) {
    if (dataset.file && await fs.pathExists(datasetUtils.fullFilePath(dataset))) {
      debug('Delete previously extended file')
      await fs.remove(datasetUtils.fullFilePath(dataset))
      if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
    }
  }

  debug('Run index stream')
  let readStreams, writeStream
  const progress = taskProgress(app, dataset.id, exports.eventsPrefix, 100, (progress) => {
    debugHeap('progress ' + progress, indexStream)
  })
  await progress(0)
  debugHeap('before-stream')
  if (dataset.isRest) {
    readStreams = await restDatasetsUtils.readStreams(db, dataset, dataset.status === 'updated' || dataset.status === 'extended-updated', progress)
    writeStream = restDatasetsUtils.markIndexedStream(db, dataset)
  } else {
    const extended = dataset.extensions && dataset.extensions.find(e => e.active)
    if (!extended) await fs.remove(datasetUtils.fullFilePath(dataset))
    readStreams = await datasetUtils.readStreams(db, dataset, false, extended, false, progress)
    writeStream = new Writable({ objectMode: true, write (chunk, encoding, cb) { cb() } })
  }
  await pump(...readStreams, indexStream, writeStream)
  debug('index stream ok')
  debugHeap('after-stream')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  const result = {
    status: 'indexed',
    schema: datasetUtils.cleanSchema(dataset)
  }
  if (dataset.status === 'updated' || dataset.status === 'extended-updated') {
    result.count = await restDatasetsUtils.count(db, dataset)
  } else {
    debug('Switch alias to point to new datasets index')
    await es.switchAlias(esClient, dataset, indexName)
    result.count = indexStream.i
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if ((dataset.status === 'updated' || dataset.status === 'extended-updated') && await restDatasetsUtils.count(db, dataset, { _needsIndexing: true })) {
    debug('REST dataset indexed, but some data is still fresh, stay in "updated" status')
    result.status = 'updated'
  }

  await datasetUtils.applyPatch(db, dataset, result)
}
