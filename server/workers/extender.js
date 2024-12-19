import debug from 'debug'
import extensionsUtils from '../datasets/utils/extensions.js'
import datasetUtils from '../datasets/utils.js'
import datasetService from '../datasets/service.js'
import restDatasetsUtils from '../datasets/utils/rest.js'

const debugMasterData = debug('master-data')

// Index tabular datasets with elasticsearch using available information on dataset schema
export const eventsPrefix = 'extend'

export const process = async function (app, dataset) {
  const debug = debug(`worker:extender:${dataset.id}`)

  let updateMode = 'all'
  if (dataset.status === 'finalized' && dataset.extensions.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (dataset._partialRestStatus === 'updated') updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const db = app.get('db')
  const patch = {}
  if (updateMode === 'all') {
    patch.status = 'extended'
  } else {
    patch._partialRestStatus = 'extended'
  }

  let extensions = dataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  debug('check extensions validity')
  await extensionsUtils.checkExtensions(db, dataset.schema, extensions)

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(app, dataset, extensions, updateMode, dataset.validateDraft)
  debug('extensions ok')

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (updateMode !== 'all' && await restDatasetsUtils.count(db, dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch._partialRestStatus = 'updated'
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
