const debugMasterData = require('debug')('master-data')

// Index tabular datasets with elasticsearch using available information on dataset schema
exports.eventsPrefix = 'extend'

exports.process = async function (app, dataset) {
  const extensionsUtils = require('../datasets/utils/extensions')
  const datasetUtils = require('../datasets/utils')
  const datasetService = require('../datasets/service')
  const restDatasetsUtils = require('../datasets/utils/rest')

  const debug = require('debug')(`worker:extender:${dataset.id}`)

  let updateMode = 'all'
  if (dataset.status === 'finalized' && dataset.extensions.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (dataset.status === 'updated') updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const db = app.get('db')
  const patch = { status: updateMode === 'all' ? 'extended' : 'extended-updated' }

  let extensions = dataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  debug('check extensions validity')
  await extensionsUtils.checkExtensions(db, dataset.schema, extensions)

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(app, dataset, extensions, updateMode)
  debug('extensions ok')

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (updateMode !== 'all' && await restDatasetsUtils.count(db, dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch.status = 'updated'
  }

  debugMasterData(`apply patch after extensions ${dataset.id} (${dataset.slug})`, patch)
  if (updateMode !== 'updatedLines') {
    patch.extensions = dataset.extensions.map(e => {
      const doneE = { ...e }
      delete doneE.needsUpdate
      return doneE
    })
  }
  await datasetService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
  debug('done')
}
