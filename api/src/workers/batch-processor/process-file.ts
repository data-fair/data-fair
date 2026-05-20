import { Writable } from 'stream'
import config from '#config'
import * as journals from '../../misc/utils/journals.ts'
import { jsonSchema } from '../../datasets/utils/data-schema.ts'
import * as ajv from '../../misc/utils/ajv.ts'
import pump from '../../misc/utils/pipe.ts'
import { sendResourceEvent } from '../../misc/utils/notifications.ts'
import * as datasetUtils from '../../datasets/utils/index.js'
import * as datasetsService from '../../datasets/service.js'
import * as schemaUtils from '../../datasets/utils/data-schema.ts'
import taskProgress from '../../datasets/utils/task-progress.ts'
import { readStreams as getReadStreams } from '../../datasets/utils/data-streams.js'
import { DiagnosticWriter } from '../../datasets/utils/diagnostic-file.ts'
import * as extensionsUtils from '../../datasets/utils/extensions.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import truncateMiddle from 'truncate-middle'
import debugLib from 'debug'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import type { CustomAjvValidate } from '../../misc/utils/ajv.ts'

// File-dataset processor: runs schema validation then (if extensions exist) runs
// extensions, accumulating every row error into a single DiagnosticWriter. Throws
// [validation-error] at the end if any error was collected.

const inlineErrorsLimit = 3

class ValidateStream extends Writable {
  validate: CustomAjvValidate
  inlineErrors: string[] = []
  nbErrors = 0
  i = 0
  writer: DiagnosticWriter

  constructor (options: { dataset: DatasetInternal, writer: DiagnosticWriter }) {
    super({ objectMode: true })
    const schema = jsonSchema((options.dataset.schema ?? []).filter(p => !p['x-calculated'] && !p['x-extension']))
    this.validate = ajv.compile(schema, false)
    this.writer = options.writer
  }

  _write (chunk: any, encoding: string, callback: (err?: Error | null) => void) {
    this.i++
    let rawErrors: any[] = []
    const valid = this.validate(chunk, 'fr', errs => { rawErrors = errs ?? [] })
    if (valid) {
      callback()
      return
    }
    this.nbErrors++
    if (this.nbErrors <= inlineErrorsLimit) {
      this.inlineErrors.push(`Ligne ${this.i}: ${this.validate.errors}`)
    }
    const lineNumber = this.i
    const writerErrors = rawErrors.length
      ? rawErrors.map(err => {
        const field = (err?.instancePath ?? '').replace(/^\//, '') || err?.params?.missingProperty || ''
        const rawValue = field ? String((chunk as any)?.[field] ?? '') : ''
        return {
          field,
          message: err?.message ?? JSON.stringify(err),
          rawValue
        }
      })
      : [{ field: '', message: this.validate.errors ?? 'invalid row', rawValue: '' }]
    ;(async () => {
      for (const e of writerErrors) {
        await this.writer.addError({
          line: lineNumber,
          type: 'validation',
          field: e.field,
          message: e.message,
          rawValue: e.rawValue
        })
      }
    })().then(() => callback(), callback)
  }

  errorsSummary () {
    if (!this.nbErrors) return null
    const leftOut = this.nbErrors - inlineErrorsLimit
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n`
    msg += this.inlineErrors.map(err => truncateMiddle(err, 80, 60, '...')).join('\n')
    if (leftOut > 0) msg += `\n${leftOut} autres erreurs...`
    return msg
  }
}

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:process-file:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape validation.')
  if (dataset.isRest) throw new Error('Un jeu de données éditable ne devrait pas passer par l\'étape validation.')

  const patch: Partial<DatasetInternal> = {}
  // status default — overwritten when extensions run successfully
  patch.status = dataset.status === 'validation-updated' ? 'finalized' : 'validated'

  const cancelDraft = async () => {
    await journals.log('datasets', dataset, { type: 'draft-cancelled', data: 'annulation automatique' } as any)
    await datasetsService.cancelDraft(dataset)
    await datasetsService.applyPatch({ ...dataset, draftReason: null }, { draft: null })
  }

  // ----- existing draft compatibility checks (breaking schema changes) -----
  if (dataset.draftReason) {
    if (dataset.draftReason.validationMode !== 'never') {
      patch.validateDraft = true
    }

    const datasetFull = await mongo.datasets.findOne({ id: dataset.id })
    if (!datasetFull) throw new Error('missing dataset')
    if (datasetFull.status === 'draft' && !datasetFull.schema?.length) {
      // nothing pre-existing schema to compare to
    } else {
      if (datasetFull.draft) Object.assign(datasetFull.draft, patch)
      const datasetDraft = datasetUtils.mergeDraft({ ...datasetFull })
      const breakingChanges = schemaUtils.getSchemaBreakingChanges(datasetFull.schema ?? [], datasetDraft.schema, false, true)
      if (breakingChanges.length) {
        const validationError = 'La structure du fichier contient des ruptures de compatibilité : ' + breakingChanges.map(b => b.summary).join(', ')
        await journals.log('datasets', dataset, { type: 'validation-error', data: validationError } as any)

        if (dataset.draftReason.validationMode === 'compatible') {
          delete patch.validateDraft
        }
        if (dataset.draftReason.validationMode === 'compatibleOrCancel') {
          delete patch.validateDraft
          await cancelDraft()
          return
        }
      }
    }
  }
  // sync dataset.validateDraft with the patch decided above so phase B reads
  // all lines (instead of the 100-line draft sample) when we are about to
  // promote the draft. The mongo doc still has the pre-run value, which is
  // unset in the auto-validation flow — without this sync extend() would
  // truncate the extended file to 100 lines and indexLines would inherit it.
  if (patch.validateDraft) dataset.validateDraft = true

  // ----- single DiagnosticWriter for the whole run -----
  const writer = new DiagnosticWriter(dataset)

  // ----- Phase A: schema validation (if any rules) -----
  let validationStream: ValidateStream | null = null
  if (datasetUtils.schemaHasValidationRules(dataset.schema)) {
    debug('phase A: validate')
    const progress = taskProgress(dataset.id, 'validate', 100)
    await progress.inc(0)
    const readStreams = await getReadStreams(dataset, false, false, true, progress)
    validationStream = new ValidateStream({ dataset, writer })
    await pump(...readStreams, validationStream)
    debug('phase A: done', { nbErrors: validationStream.nbErrors })
  }
  // No early cancel for compatibleOrCancel — phase B still runs so the cancel
  // decision below can account for mandatory extension errors too.

  const nbValidationErrors = validationStream?.nbErrors ?? 0

  // ----- Phase B: extensions (if any active) -----
  const activeExtensions = (dataset.extensions ?? []).filter((e: any) => e.active)
  let blockingExtensionErrors = 0
  if (activeExtensions.length) {
    debug('phase B: extend')
    await extensionsUtils.checkExtensions(dataset.schema!, activeExtensions)
    await journals.log('datasets', dataset, { type: 'extend-start' } as any)
    await extensionsUtils.extend(
      dataset,
      activeExtensions,
      'all',
      dataset.validateDraft,
      undefined,
      undefined,
      async (absoluteIndex: number, err: any) => {
        if (!err.mandatory) return // non-mandatory remoteService stays in row.error, not in diagnostic
        blockingExtensionErrors++
        await writer.addError({
          line: absoluteIndex + 1,
          type: 'extension',
          field: err.propertyKey,
          message: err.message,
          rawValue: ''
        })
      }
    )
    await journals.log('datasets', dataset, { type: 'extend-end' } as any)
    debug('phase B: done', { blockingExtensionErrors })
  }

  // ----- Aggregate decision -----
  if (writer.errorCount > 0) {
    const summaryParts: string[] = []
    if (nbValidationErrors > 0) {
      const validationSummary = validationStream?.errorsSummary() ?? `${nbValidationErrors} ligne(s) en erreur de validation`
      summaryParts.push(validationSummary)
    }
    if (blockingExtensionErrors > 0) {
      summaryParts.push(`${blockingExtensionErrors} ligne(s) en échec d'enrichissement obligatoire`)
    }
    const summary = summaryParts.join('\n')

    // compatibleOrCancel: auto-cancel the draft. We discard the writer (the draft
    // directory is about to be wiped, so the diagnostic file would be orphaned)
    // and emit a draft-cancelled event with breakdown counts instead of a
    // validation-error event that would reference a nonexistent file.
    if (dataset.draftReason?.validationMode === 'compatibleOrCancel') {
      await writer.discard()
      delete patch.validateDraft
      await journals.log('datasets', dataset, {
        type: 'draft-cancelled',
        data: `annulation automatique : ${summary}`,
        validationErrorCount: nbValidationErrors,
        extensionErrorCount: blockingExtensionErrors
      } as any)
      await datasetsService.cancelDraft(dataset)
      await datasetsService.applyPatch({ ...dataset, draftReason: null }, { draft: null })
      return
    }

    const fileResult = await writer.finalize()
    await journals.log('datasets', dataset, {
      type: 'validation-error',
      data: summary,
      hasDiagnosticFile: true,
      diagnosticErrorCount: fileResult.count,
      diagnosticCapped: fileResult.capped,
      validationErrorCount: nbValidationErrors,
      extensionErrorCount: blockingExtensionErrors
    } as any)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
      params: {
        nbErrors: String(fileResult.count),
        diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
      }
    })
    delete patch.validateDraft
    throw new Error(`[validation-error] ${summary}`)
  } else {
    await writer.discard()
  }

  // ----- Success path: bookkeeping -----
  if (activeExtensions.length) {
    // status advances directly to 'extended' (skipping the old intermediate 'validated')
    if (dataset.status !== 'validation-updated') patch.status = 'extended'
    // clear needsUpdate flags on extensions, mirroring today's extend.ts post-loop
    if (dataset.extensions) {
      patch.extensions = dataset.extensions.map((e: any) => {
        const doneE = { ...e }
        delete doneE.needsUpdate
        return doneE
      })
    }
  }

  if (patch.validateDraft) {
    await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation automatique' } as any)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validated', {
      localizedParams: { fr: { cause: 'validation automatique' }, en: { cause: 'automatic validation' } }
    })
  }

  await datasetsService.applyPatch(dataset, patch)
  if (activeExtensions.length && !dataset.draftReason) await updateStorage(dataset, false, true)
}
