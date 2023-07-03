// Index tabular datasets with elasticsearch using available information on dataset schema
exports.eventsPrefix = 'extend'

exports.process = async function (app, dataset) {
  const extensionsUtils = require('../utils/extensions')
  const datasetUtils = require('../utils/dataset')
  const restDatasetsUtils = require('../utils/rest-datasets')

  const debug = require('debug')(`worker:extender:${dataset.id}`)

  const db = app.get('db')
  const patch = { status: dataset.status === 'updated' ? 'extended-updated' : 'extended' }

  debug('check extensions validity')
  const validExtensions = await extensionsUtils.filterExtensions(db, dataset.schema, dataset.extensions || [])
  if (validExtensions.length !== (dataset.extensions || []).length) {
    patch.extensions = validExtensions
    patch.schema = await extensionsUtils.prepareSchema(db, dataset.schema, dataset.extensions || [])
  }

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(app, dataset, validExtensions)
  debug('extensions ok')

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (dataset.status === 'updated' && await restDatasetsUtils.count(db, dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch.status = 'updated'
  }

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
  debug('done')
}
