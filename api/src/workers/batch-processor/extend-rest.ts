import debugLib from 'debug'
import * as extensionsUtils from '../../datasets/utils/extensions.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetService from '../../datasets/service.ts'
import * as restDatasetsUtils from '../../datasets/utils/rest.ts'
import type { DatasetInternal } from '#types'
import { isRestDataset } from '@data-fair/data-fair-shared/types-utils.ts'

const debugMasterData = debugLib('master-data')

// REST-only extension worker. Runs after a REST dataset has new lines
// (_partialRestStatus === 'updated') or when an extension has needsUpdate.
// Mandatory extensions for REST are enforced on the request hot path
// (api/src/datasets/utils/rest.ts → applyReqTransactions), not here, so this
// worker never writes the validation-diagnostic CSV.

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:extend-rest:${dataset.id}`)

  if (!isRestDataset(dataset)) {
    throw new Error(`extend-rest invoked on non-REST dataset ${dataset.id} — should not happen after the process-file merge`)
  }
  // keep the DatasetInternal view after isRestDataset() narrows the type to RestDataset
  const internalDataset = dataset as DatasetInternal

  let updateMode: 'all' | 'updatedLines' | 'updatedExtensions' = 'all'
  if (internalDataset.status === 'finalized' && internalDataset.extensions?.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (internalDataset._partialRestStatus === 'updated') updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const patch: Partial<DatasetInternal> = {}
  if (updateMode === 'all') {
    patch.status = 'extended'
  } else {
    patch._partialRestStatus = 'extended'
  }

  let extensions = internalDataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  debug('check extensions validity')
  await extensionsUtils.checkExtensions(internalDataset.schema!, extensions)

  debug('apply extensions', internalDataset.extensions)
  await extensionsUtils.extend(internalDataset, extensions, updateMode, internalDataset.validateDraft)
  debug('extensions ok')

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (updateMode !== 'all' && await restDatasetsUtils.count(dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch._partialRestStatus = 'updated'
  }

  debugMasterData(`apply patch after extensions ${internalDataset.id} (${internalDataset.slug})`, patch)
  if (updateMode !== 'updatedLines' && internalDataset.extensions) {
    patch.extensions = internalDataset.extensions.map(e => {
      const doneE = { ...e }
      delete doneE.needsUpdate
      return doneE
    })
  }
  await datasetService.applyPatch(internalDataset, patch)
  if (!internalDataset.draftReason) await updateStorage(internalDataset, false, true)
  debug('done')
}
