import config from '#config'
import debugLib from 'debug'
import * as extensionsUtils from '../../datasets/utils/extensions.ts'
import { DiagnosticWriter } from '../../datasets/utils/diagnostic-file.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetService from '../../datasets/service.js'
import * as restDatasetsUtils from '../../datasets/utils/rest.ts'
import * as journals from '../../misc/utils/journals.ts'
import { sendResourceEvent } from '../../misc/utils/notifications.ts'
import type { DatasetInternal } from '#types'
import { isRestDataset } from '@data-fair/data-fair-shared/types-utils.ts'

const debugMasterData = debugLib('master-data')

// Index tabular datasets with elasticsearch using available information on dataset schema

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:extender:${dataset.id}`)

  let updateMode: 'all' | 'updatedLines' | 'lineIds' | 'updatedExtensions' = 'all'
  if (dataset.status === 'finalized' && dataset.extensions?.find(e => e.needsUpdate)) updateMode = 'updatedExtensions'
  else if (dataset._partialRestStatus === 'updated') updateMode = 'updatedLines'
  debug('update mode', updateMode)

  const patch: Partial<DatasetInternal> = {}
  if (updateMode === 'all') {
    patch.status = 'extended'
  } else {
    patch._partialRestStatus = 'extended'
  }

  let extensions = dataset.extensions || []
  if (updateMode === 'updatedExtensions') extensions = extensions.filter(e => e.needsUpdate)

  debug('check extensions validity')
  await extensionsUtils.checkExtensions(dataset.schema!, extensions)

  // Diagnostic writer is opened lazily; only file-mode runs that go through every
  // line benefit from collecting per-row failures. For partial REST runs the
  // mandatory check has already been enforced on the hot path.
  const collectDiagnostic = !isRestDataset(dataset) && updateMode === 'all'
  const writer = collectDiagnostic ? new DiagnosticWriter(dataset) : null
  let totalErrors = 0
  let blockingErrors = 0

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(
    dataset,
    extensions,
    updateMode,
    dataset.validateDraft,
    undefined,
    undefined,
    writer
      ? async (absoluteIndex, err) => {
        totalErrors++
        if (err.mandatory) blockingErrors++
        await writer.addError({
          line: absoluteIndex + 1,
          type: 'extension',
          field: err.propertyKey,
          message: err.message,
          rawValue: ''
        })
      }
      : undefined
  )
  debug('extensions ok')

  if (writer) {
    if (totalErrors > 0) {
      const fileResult = await writer.finalize()
      const summary = blockingErrors > 0
        ? `${totalErrors} ligne(s) avec un échec d'enrichissement (dont ${blockingErrors} bloquant(s))`
        : `${totalErrors} ligne(s) avec un échec d'enrichissement`
      await journals.log('datasets', dataset, {
        type: 'validation-error',
        data: summary,
        hasDiagnosticFile: true,
        diagnosticErrorCount: fileResult.count,
        diagnosticCapped: fileResult.capped
      } as any)

      if (blockingErrors > 0) {
        await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
          params: {
            nbErrors: String(blockingErrors),
            diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
          }
        })
        throw new Error(`[noretry] ${blockingErrors} ligne(s) en échec bloquant lors de l'enrichissement`)
      }
    } else {
      await writer.discard()
    }
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (updateMode !== 'all' && isRestDataset(dataset) && await restDatasetsUtils.count(dataset, { _needsExtending: true })) {
    debug('REST dataset extended, but some data has changed, stay in "updated" status')
    patch._partialRestStatus = 'updated'
  }

  debugMasterData(`apply patch after extensions ${dataset.id} (${dataset.slug})`, patch)
  if (updateMode !== 'updatedLines' && dataset.extensions) {
    patch.extensions = dataset.extensions.map(e => {
      const doneE = { ...e }
      delete doneE.needsUpdate
      return doneE
    })
  }
  await datasetService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset, false, true)
  debug('done')
}
