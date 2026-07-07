import { join } from 'path'
import * as journals from '../../misc/utils/journals.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Writable } from 'stream'
import pump from '../../misc/utils/pipe.ts'
import * as es from '../../datasets/es/index.ts'
import esClient from '#es'
import { initDatasetIndex, switchAlias } from '../../datasets/es/manage-indices.ts'
import getIndexStream from '../../datasets/es/index-stream.ts'
import * as datasetUtils from '../../datasets/utils/index.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import { readStreams as getReadStreams } from '../../datasets/utils/data-streams.ts'
import * as datasetsService from '../../datasets/service.ts'
import * as restDatasetsUtils from '../../datasets/utils/rest.ts'
import * as heapUtils from '../../misc/utils/heap.ts'
import taskProgress from '../../datasets/utils/task-progress.ts'
import { dataDir, validationDiagnosticFilePath, cancelledDraftDiagnosticFilePath } from '../../datasets/utils/files.ts'
import * as attachmentsUtils from '../../datasets/utils/attachments.ts'
import debugModule from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'
import type { DatasetInternal, Event } from '#types'
import { isRestDataset } from '#types/dataset/index.ts'
import filesStorage from '#files-storage'
import config from '#config'
import { DiagnosticWriter, DIAGNOSTIC_FILE_CAP } from '../../datasets/utils/diagnostic-file.ts'
import { findUnicityDuplicates } from '../../datasets/es/unicity-agg.ts'
import { unicityViolationMessage } from '../../datasets/utils/constraints.ts'
import { sendResourceEvent } from '../../misc/utils/notifications.ts'

// Index tabular datasets with elasticsearch using available information on dataset schema

const eventsPrefix = 'index'

export default async function (dataset: DatasetInternal) {
  const debug = debugModule(`worker:indexer:${dataset.id}`)
  const debugHeap = heapUtils.debug(`worker:indexer:${dataset.id}`)

  if (global.process.env.NODE_ENV === 'development' && dataset.slug === 'trigger-test-error') {
    throw new Error('This is a test error')
  }
  if (global.process.env.NODE_ENV === 'development' && dataset.slug === 'trigger-test-error-400') {
    throw httpError(400, '[noretry] This is a test 400 error')
  }

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape indexation.')

  const partialUpdate = dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended'

  const attachmentsProperty = dataset.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')

  const newRestAttachments = dataset._newRestAttachments
  if (isRestDataset(dataset) && attachmentsProperty && newRestAttachments?.length) {
    for (const a of newRestAttachments) {
      let newAttachments
      const filePath = join(dataDir, 'shared-tmp', a.startsWith('drop:') ? a.replace('drop:', '') : a)
      if (!await filesStorage.pathExists(filePath)) {
        console.warn(`newRestAttachments of dataset ${dataset.id} references missing attachments file`, a)
      } else {
        if (a.startsWith('drop:')) {
          newAttachments = await attachmentsUtils.replaceAllAttachments(dataset, filePath)
        } else {
          newAttachments = await attachmentsUtils.addAttachments(dataset, filePath)
        }
        const bulkOp = restDatasetsUtils.collection(dataset).initializeUnorderedBulkOp()
        for (const a of newAttachments) {
          bulkOp.find({ [attachmentsProperty.key]: a }).update({ $set: { _needsIndexing: true } })
        // TODO: add option to remove attachments that don't match any line ?
        }
        await bulkOp.execute()
      }
      await mongo.datasets.updateOne({ id: dataset.id }, { $pull: { _newRestAttachments: a } })
    }
  }

  let indexName
  if (partialUpdate) {
    indexName = es.aliasName(dataset)
    debug(`Update index ${indexName}`)
  } else {
    try {
      indexName = await initDatasetIndex(dataset)
    } catch (err) {
      internalError('es-init-index', err)
      const { message } = es.extractError(err)
      throw new Error(message)
    }
    debug(`Initialize new dataset index ${indexName}`)
  }

  const indexStream = getIndexStream({ indexName, dataset, attachments: !!attachmentsProperty })

  if (!dataset.extensions || dataset.extensions.filter(e => e.active).length === 0) {
    if (dataset.file && await filesStorage.pathExists(datasetUtils.fullFilePath(dataset))) {
      debug('Delete previously extended file')
      await filesStorage.removeFile(datasetUtils.fullFilePath(dataset))
      if (!dataset.draftReason) await updateStorage(dataset, false, true)
    }
  }

  debug('Run index stream')
  let readStreams, writeStream
  const progress = taskProgress(dataset.id, eventsPrefix, 100, (progress) => {
    debugHeap('progress ' + progress, indexStream)
  })
  await progress.inc(0)
  debugHeap('before-stream')
  if (isRestDataset(dataset)) {
    readStreams = await restDatasetsUtils.readStreams(dataset, partialUpdate ? { _needsIndexing: true } : {}, progress)
    writeStream = restDatasetsUtils.markIndexedStream(dataset)
  } else {
    const extended = dataset.extensions && dataset.extensions.some(e => e.active)
    if (!extended) await filesStorage.removeFile(datasetUtils.fullFilePath(dataset))
    readStreams = await getReadStreams(dataset, false, extended, dataset.validateDraft, progress)
    writeStream = new Writable({ objectMode: true, write (chunk, encoding, cb) { cb() } })
  }
  await pump(...readStreams, indexStream, writeStream)
  debug('index stream ok')
  debugHeap('after-stream')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) {
    await journals.log('datasets', dataset, { type: 'error', data: errorsSummary } as any)
  }

  const result: Partial<DatasetInternal> = {
    schema: datasetUtils.cleanSchema(dataset)
  }
  if (partialUpdate && isRestDataset(dataset)) {
    result._partialRestStatus = 'indexed'
    result.count = await restDatasetsUtils.count(dataset)
  } else {
    // Dataset-wide unique constraints: detect duplicates in the freshly-built
    // temp index before promoting it. File datasets only (REST enforce via a
    // MongoDB unique index). Real stored columns are guaranteed by config-time
    // checkConstraints.
    const uniqueConstraints = (dataset.constraints ?? []).filter((c: any) => c.type === 'unique')
    // Only pay the DiagnosticWriter cost (S3 pathExists + Mongo updateOne in discard())
    // for datasets that have or plausibly had a constraint. `dataset.constraints` stays
    // truthy (an empty array) when a constraint is dropped: preparePatch normalizes the
    // API's `constraints: null` unset idiom to `[]` too, so both the UI path and a direct
    // API PATCH end up with the same shape here and get cleaned up the same way.
    if (!isRestDataset(dataset) && (uniqueConstraints.length || dataset.constraints)) {
      // Always run through a DiagnosticWriter, even with zero constraints: discard()
      // clears any stale diagnostic left by a prior failed run (e.g. the constraint
      // that caused the previous error was since dropped from the dataset).
      const writer = new DiagnosticWriter(dataset)
      let unicityErrorCount = 0
      if (uniqueConstraints.length) {
        await esClient.client.indices.refresh({ index: indexName })
        for (const constraint of uniqueConstraints) {
          const remaining = DIAGNOSTIC_FILE_CAP - unicityErrorCount
          if (remaining <= 0) break
          const groups = await findUnicityDuplicates(indexName, constraint, dataset.schema ?? [], remaining)
          const field = constraint.properties.join(', ')
          const message = unicityViolationMessage(constraint.properties, dataset.schema)
          for (const group of groups) {
            for (const line of group.lines) {
              await writer.addError({
                line,
                type: 'unicity',
                field,
                message: `${message}${group.count > group.lines.length ? ` (${group.count} occurrences)` : ''}`,
                rawValue: group.keyLabel
              })
              unicityErrorCount++
            }
          }
        }
      }
      if (unicityErrorCount > 0) {
        const fileResult = await writer.finalize()
        const summary = `${unicityErrorCount} ligne(s) en double sur une contrainte d'unicité`
        const diagnosticEventData = {
          hasDiagnosticFile: true,
          diagnosticErrorCount: fileResult.count,
          diagnosticCapped: fileResult.capped,
          unicityErrorCount
        }
        // compatibleOrCancel drafts: same auto-cancel semantics as validation/extension
        // errors in process-file.ts — relocate the diagnostic out of the draft dir (about
        // to be wiped) to the stable cancelled-draft slot, log draft-cancelled instead of
        // validation-error, cancel the draft and return without promoting the temp index
        // (cancelDraft's deleteIndex removes every non-prod index of the dataset,
        // including the temp one built by this run)
        if (dataset.draftReason?.validationMode === 'compatibleOrCancel') {
          const srcDiagnostic = validationDiagnosticFilePath(dataset)
          if (await filesStorage.pathExists(srcDiagnostic)) {
            await filesStorage.moveFile(srcDiagnostic, cancelledDraftDiagnosticFilePath(dataset))
          }
          await journals.log('datasets', dataset, {
            type: 'draft-cancelled',
            data: `annulation automatique : ${summary}`,
            ...diagnosticEventData
          } as Event)
          await datasetsService.cancelDraft(dataset)
          await datasetsService.applyPatch({ ...dataset, draftReason: null }, { draft: null })
          return
        }
        await journals.log('datasets', dataset, {
          type: 'validation-error',
          data: summary,
          ...diagnosticEventData
        } as Event)
        await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
          params: {
            nbErrors: String(fileResult.count),
            diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
          }
        })
        // do not promote the temp index; drop it so it does not leak
        await esClient.client.indices.delete({ index: indexName }).catch(err => internalError('es-delete-unicity-temp-index', err))
        throw new Error(`[validation-error] ${summary}`)
      } else {
        await writer.discard()
      }
    }
    result.status = 'indexed'
    debug('Switch alias to point to new datasets index')
    await switchAlias(dataset, indexName)
    result.count = indexStream.i
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (dataset._partialRestStatus === 'extended' && isRestDataset(dataset) && await restDatasetsUtils.count(dataset, { _needsExtending: true })) {
    debug('REST dataset indexed, but some data still needs extending, get back in "updated" status')
    result._partialRestStatus = 'updated'
  } else if ((dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended') && isRestDataset(dataset) && await restDatasetsUtils.count(dataset, { _needsIndexing: true })) {
    debug(`REST dataset indexed, but some data is still fresh, stay in "${dataset.status}" status`)
    result._partialRestStatus = (dataset as DatasetInternal)._partialRestStatus
  }

  await datasetsService.applyPatch(dataset, result)
}
