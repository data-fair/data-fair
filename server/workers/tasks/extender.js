const extensionsUtils = require('../../datasets/utils/extensions')

const debugMasterData = require('debug')('master-data')

// const eventsPrefix = 'extend'

exports.process = async function (app, dataset, patch, ignoreDraftLimit = false, fromLoadingDir = false) {
  const debug = require('debug')(`worker:extender:${dataset.id}`)

  let updateMode = 'all'
  if (dataset.status === 'finalized' && dataset.extensions.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (dataset._restPartialUpdate) updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const db = app.get('db')

  let extensions = dataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  if (updateMode !== 'updatedLines') {
    debug('check extensions validity')
    await extensionsUtils.checkExtensions(db, dataset.schema, extensions)
  }

  debug('apply extensions', dataset.extensions)
  // TODO: "full" file of a new data file should be created in the "loading" directory
  await extensionsUtils.extend(app, dataset, extensions, updateMode, ignoreDraftLimit, fromLoadingDir)
  debug('extensions ok')

  debugMasterData(`apply patch after extensions ${dataset.id} (${dataset.slug})`, patch)
  if (updateMode !== 'updatedLines') {
    patch.extensions = dataset.extensions.map(e => {
      const doneE = { ...e }
      delete doneE.needsUpdate
      return doneE
    })
  }
  debug('done')
}
