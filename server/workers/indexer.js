// Index tabular datasets with elasticsearch using available information on dataset schema
const util = require('util')
const pump = util.promisify(require('pump'))
const fs = require('fs-extra')
const { Writable } = require('stream')
const es = require('../utils/es')
const datasetUtils = require('../utils/dataset')
const restDatasetsUtils = require('../utils/rest-datasets')
const journals = require('../utils/journals')
const taskProgress = require('../utils/task-progress')

exports.eventsPrefix = 'index'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:indexer:${dataset.id}`)

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
      console.error('elasticsearch init index error', err)
      const message = es.errorMessage(err)
      throw new Error(message)
    }
    debug(`Initialize new dataset index ${indexName}`)
  }
  const attachments = !!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  const indexStream = es.indexStream({ esClient, indexName, dataset, attachments })

  debug('Run index stream')
  let readStreams, writeStream
  const progress = taskProgress(app, dataset.id, exports.eventsPrefix, 100)
  await progress(0)
  if (dataset.isRest) {
    readStreams = await restDatasetsUtils.readStreams(db, dataset, dataset.status === 'updated' || dataset.status === 'extended-updated', progress)
    writeStream = restDatasetsUtils.markIndexedStream(db, dataset)
  } else {
    const extended = dataset.extensions && dataset.extensions.find(e => e.active)
    if (!extended) await fs.remove(datasetUtils.fullFileName(dataset))
    readStreams = await datasetUtils.readStreams(db, dataset, false, extended, false, progress)
    writeStream = new Writable({ objectMode: true, write(chunk, encoding, cb) { cb() } })
  }
  await pump(...readStreams, indexStream, writeStream)
  debug('index stream ok')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  const result = {
    status: 'indexed',
    schema: datasetUtils.cleanSchema(dataset),
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
