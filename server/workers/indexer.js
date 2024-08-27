const metrics = require('../misc/utils/metrics')
const journals = require('../misc/utils/journals')

// Index tabular datasets with elasticsearch using available information on dataset schema
exports.eventsPrefix = 'index'

exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const createError = require('http-errors')
  const { Writable } = require('stream')
  const pump = require('../misc/utils/pipe')
  const es = require('../datasets/es')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const restDatasetsUtils = require('../datasets/utils/rest')
  const taskProgress = require('../datasets/utils/task-progress')

  const debug = require('debug')(`worker:indexer:${dataset.id}`)
  const debugHeap = require('../misc/utils/heap').debug(`worker:indexer:${dataset.id}`)

  if (process.env.NODE_ENV === 'test' && dataset.slug === 'trigger-test-error') {
    throw new Error('This is a test error')
  }
  if (process.env.NODE_ENV === 'test' && dataset.slug === 'trigger-test-error-400') {
    throw createError(400, '[noretry] This is a test 400 error')
  }

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape indexation.')

  const db = app.get('db')
  const esClient = app.get('es')

  const partialUpdate = dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended'

  let indexName
  if (partialUpdate) {
    indexName = es.aliasName(dataset)
    debug(`Update index ${indexName}`)
  } else {
    try {
      indexName = await es.initDatasetIndex(esClient, dataset)
    } catch (err) {
      metrics.internalError('es-init-index', err)
      const { message } = es.extractError(err)
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
      if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
    }
  }

  debug('Run index stream')
  let readStreams, writeStream
  const progress = taskProgress(app, dataset.id, exports.eventsPrefix, 100, (progress) => {
    debugHeap('progress ' + progress, indexStream)
  })
  await progress.inc(0)
  debugHeap('before-stream')
  if (dataset.isRest) {
    readStreams = await restDatasetsUtils.readStreams(db, dataset, partialUpdate ? { _needsIndexing: true } : {}, progress)
    writeStream = restDatasetsUtils.markIndexedStream(db, dataset)
  } else {
    const extended = dataset.extensions && dataset.extensions.find(e => e.active)
    if (!extended) await fs.remove(datasetUtils.fullFilePath(dataset))
    readStreams = await datasetUtils.readStreams(db, dataset, false, extended, dataset.validateDraft, progress)
    writeStream = new Writable({ objectMode: true, write (chunk, encoding, cb) { cb() } })
  }
  await pump(...readStreams, indexStream, writeStream)
  debug('index stream ok')
  debugHeap('after-stream')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  const result = {
    schema: datasetUtils.cleanSchema(dataset)
  }
  if (partialUpdate) {
    result._partialRestStatus = 'indexed'
    result.count = await restDatasetsUtils.count(db, dataset)
  } else {
    result.status = 'indexed'
    debug('Switch alias to point to new datasets index')
    await es.switchAlias(esClient, dataset, indexName)
    result.count = indexStream.i
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (dataset._partialRestStatus === 'extended' && await restDatasetsUtils.count(db, dataset, { _needsExtending: true })) {
    debug('REST dataset indexed, but some data still needs extending, get back in "updated" status')
    result._partialRestStatus = 'updated'
  } else if ((dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended') && await restDatasetsUtils.count(db, dataset, { _needsIndexing: true })) {
    debug(`REST dataset indexed, but some data is still fresh, stay in "${dataset.status}" status`)
    result._partialRestStatus = dataset._partialRestStatus
  }

  await datasetsService.applyPatch(app, dataset, result)
}
