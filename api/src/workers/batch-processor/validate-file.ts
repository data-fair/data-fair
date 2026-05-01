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
import truncateMiddle from 'truncate-middle'
import debugLib from 'debug'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import type { CustomAjvValidate } from '../../misc/utils/ajv.ts'

// Index tabular datasets with elasticsearch using available information on dataset schema
export const eventsPrefix = 'validate'

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
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n<br>`
    msg += this.inlineErrors.map(err => truncateMiddle(err, 80, 60, '...')).join('\n<br>')
    if (leftOut > 0) msg += `\n<br>${leftOut} autres erreurs...`
    return msg
  }
}

export default async function (dataset: DatasetInternal) {
  const debug = debugLib(`worker:validator:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape validation.')
  if (dataset.isRest) throw new Error('Un jeu de données éditable ne devrait pas passer par l\'étape validation.')

  const patch: Partial<DatasetInternal> = { status: dataset.status === 'validation-updated' ? 'finalized' : 'validated' }

  const cancelDraft = async () => {
    await journals.log('datasets', dataset, { type: 'draft-cancelled', data: 'annulation automatique' } as any)
    await datasetsService.cancelDraft(dataset)
    await datasetsService.applyPatch({ ...dataset, draftReason: null }, { draft: null })
  }

  if (dataset.draftReason) {
    // manage auto-validation of a dataset draft
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

  if (datasetUtils.schemaHasValidationRules(dataset.schema)) {
    debug('Run validator stream')
    const progress = taskProgress(dataset.id, eventsPrefix, 100)
    await progress.inc(0)
    const readStreams = await getReadStreams(dataset, false, false, true, progress)
    const writer = new DiagnosticWriter(dataset)
    const validateStream = new ValidateStream({ dataset, writer })
    await pump(...readStreams, validateStream)
    debug('Validator stream ok')

    if (validateStream.nbErrors > 0) {
      const fileResult = await writer.finalize()
      const errorsSummary = validateStream.errorsSummary() ?? ''
      await journals.log('datasets', dataset, {
        type: 'validation-error',
        data: errorsSummary,
        hasDiagnosticFile: true,
        diagnosticErrorCount: fileResult.count,
        diagnosticCapped: fileResult.capped
      } as any)
      await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'validation-error', {
        params: {
          nbErrors: String(validateStream.nbErrors),
          diagnosticUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/validation-diagnostic.csv`
        }
      })
      delete patch.validateDraft
      if (dataset.draftReason?.validationMode === 'compatibleOrCancel') {
        await cancelDraft()
        return
      } else {
        throw new Error(`[noretry] ${errorsSummary}`)
      }
    } else {
      // success: drop any stale diagnostic from a previous failed attempt
      await writer.discard()
    }
  }

  if (patch.validateDraft) {
    await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation automatique' } as any)
    await sendResourceEvent('datasets', dataset, 'data-fair-worker', 'draft-validated', { localizedParams: { fr: { cause: 'validation automatique' }, en: { cause: 'automatic validation' } } })
  }

  await datasetsService.applyPatch(dataset, patch)
}
