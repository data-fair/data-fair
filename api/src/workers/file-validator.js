import { Writable } from 'stream'
import * as journals from '../misc/utils/journals.ts'
import { jsonSchema } from '../datasets/utils/data-schema.js'
import * as ajv from '../misc/utils/ajv.js'
import pump from '../misc/utils/pipe.ts'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetsService from '../datasets/service.js'
import * as schemaUtils from '../datasets/utils/data-schema.js'
import taskProgress from '../datasets/utils/task-progress.ts'
import { readStreams as getReadStreams } from '../datasets/utils/data-streams.js'
import truncateMiddle from 'truncate-middle'
import debugLib from 'debug'
import mongo from '#mongo'

// Index tabular datasets with elasticsearch using available information on dataset schema
export const eventsPrefix = 'validate'

const maxErrors = 3

class ValidateStream extends Writable {
  constructor (options) {
    super({ objectMode: true })

    const schema = jsonSchema(options.dataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']))
    this.validate = ajv.compile(schema, false)

    /** @type {string[]} */
    this.errors = []
    this.nbErrors = 0
    this.i = 0
  }

  _write (chunk, encoding, callback) {
    this.i++
    const valid = this.validate(chunk)
    if (!valid) {
      this.nbErrors++
      if (this.nbErrors <= maxErrors) {
        this.errors.push(`Ligne ${this.i}: ${this.validate.errors}`)
      }
    }
    callback()
  }

  errorsSummary () {
    if (!this.nbErrors) return null
    const leftOutErrors = this.nbErrors - maxErrors
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n<br>`
    msg += this.errors.map(err => truncateMiddle(err, 80, 60, '...')).join('\n<br>')
    if (leftOutErrors > 0) msg += `\n<br>${leftOutErrors} autres erreurs...`
    return msg
  }
}

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:indexer:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape validation.')
  if (dataset.isRest) throw new Error('Un jeu de données éditable ne devrait pas passer par l\'étape validation.')

  const db = mongo.db

  const patch = { status: dataset.status === 'validation-updated' ? 'finalized' : 'validated' }

  const cancelDraft = async () => {
    await journals.log('datasets', dataset, { type: 'draft-cancelled', data: 'annulation automatique' })
    await datasetsService.cancelDraft(dataset)
    await datasetsService.applyPatch(app, { ...dataset, draftReason: null }, { draft: null })
  }

  if (dataset.draftReason) {
    // manage auto-validation of a dataset draft
    if (dataset.draftReason.validationMode !== 'never') {
      patch.validateDraft = true
    }

    const datasetFull = await mongo.db.collection('datasets').findOne({ id: dataset.id })
    if (datasetFull.status === 'draft' && !datasetFull.schema?.length) {
      // nothing pre-existing schema to compare to
    } else {
      Object.assign(datasetFull.draft, patch)
      const datasetDraft = datasetUtils.mergeDraft({ ...datasetFull })
      const breakingChanges = schemaUtils.getSchemaBreakingChanges(datasetFull.schema, datasetDraft.schema, false, true)
      if (breakingChanges.length) {
        const validationError = 'La structure du fichier contient des ruptures de compatibilité : ' + breakingChanges.map(b => b.summary).join(', ')
        await journals.log('datasets', dataset, { type: 'validation-error', data: validationError })

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
    const readStreams = await getReadStreams(db, dataset, false, false, false, progress)
    const validateStream = new ValidateStream({ dataset })
    await pump(...readStreams, validateStream)
    debug('Validator stream ok')

    const errorsSummary = validateStream.errorsSummary()
    if (errorsSummary) {
      await journals.log('datasets', dataset, { type: 'validation-error', data: errorsSummary })
      delete patch.validateDraft
      if (dataset.draftReason?.validationMode === 'compatibleOrCancel') {
        await cancelDraft()
        return
      } else {
        throw new Error(`[noretry] ${errorsSummary}`)
      }
    }
  }

  if (patch.validateDraft) {
    await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation automatique' })
  }

  await datasetsService.applyPatch(app, dataset, patch)
}
