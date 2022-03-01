// Index tabular datasets with elasticsearch using available information on dataset schema
const extensionsUtils = require('../utils/extensions')
const datasetUtils = require('../utils/dataset')

exports.eventsPrefix = 'extend'

exports.process = async function (app, dataset) {
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

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
  debug('done')
}
