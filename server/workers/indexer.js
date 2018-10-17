// Index tabular datasets with elasticsearch using available information on dataset schema
const util = require('util')
const pump = util.promisify(require('pump'))
const esUtils = require('../utils/es')
const esStreams = require('../utils/es-streams')
const datasetUtils = require('../utils/dataset')
const extensionsUtils = require('../utils/extensions')
const journals = require('../utils/journals')

exports.type = 'dataset'
exports.eventsPrefix = 'index'
exports.filter = { status: 'schematized' }

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:indexer:${dataset.id}`)

  const db = app.get('db')
  const esClient = app.get('es')
  const collection = db.collection('datasets')

  const tempId = await esUtils.initDatasetIndex(esClient, dataset)
  debug(`Initialied new dataset index ${tempId}`)
  const indexStream = esStreams.indexStream({ esClient, indexName: tempId, dataset, attachments: !!dataset.hasFiles })
  // reindex and preserve previous extensions
  debug('Run index stream')
  await pump(datasetUtils.readStream(dataset), extensionsUtils.preserveExtensionStream({ db, esClient, dataset, attachments: !!dataset.hasFiles }), indexStream)
  debug('index stream ok')
  const count = dataset.count = indexStream.i
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  debug('Switch alias to point to new datasets index')
  await esUtils.switchAlias(esClient, dataset, tempId)

  const result = { status: 'indexed', count }
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
}
