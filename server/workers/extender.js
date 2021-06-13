// Index tabular datasets with elasticsearch using available information on dataset schema
const extensionsUtils = require('../utils/extensions')
const datasetUtils = require('../utils/dataset')

exports.eventsPrefix = 'extend'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:extender:${dataset.id}`)

  const db = app.get('db')

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(app, dataset, dataset.extensions || [])
  debug('extensions ok')

  const patch = { status: dataset.status === 'updated' ? 'extended-updated' : 'extended' }
  await datasetUtils.applyPatch(db, dataset, patch)
  await datasetUtils.updateStorage(app.get('db'), dataset)
  debug('done')
}
