const { Writable } = require('stream')
const config = require('config')
const journals = require('../misc/utils/journals')

// Index tabular datasets with elasticsearch using available information on dataset schema
exports.eventsPrefix = 'validate'

const maxErrors = 3

class ValidateStream extends Writable {
  constructor (options) {
    super({ objectMode: true })

    const { jsonSchema } = require('../datasets/utils/schema')
    const ajv = require('../misc/utils/ajv')
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
    const truncateMiddle = require('truncate-middle')

    if (!this.nbErrors) return null
    const leftOutErrors = this.nbErrors - maxErrors
    let msg = `${Math.round(100 * (this.nbErrors / this.i))}% des lignes ont une erreur de validation.\n<br>`
    msg += this.errors.map(err => truncateMiddle(err, 80, 60, '...')).join('\n<br>')
    if (leftOutErrors > 0) msg += `\n<br>${leftOutErrors} autres erreurs...`
    if (this.nbErrors) throw new Error('[noretry] ' + msg)
    return msg
  }
}

exports.process = async function (app, dataset) {
  const pump = require('../misc/utils/pipe')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const taskProgress = require('../datasets/utils/task-progress')

  const debug = require('debug')(`worker:indexer:${dataset.id}`)

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape validation.')
  if (dataset.isRest) throw new Error('Un jeu de données éditable ne devrait pas passer par l\'étape validation.')

  const db = app.get('db')

  const patch = { status: dataset.status === 'validation-updated' ? 'finalized' : 'validated' }

  if (dataset.draftReason) {
    // manage auto-validation of a dataset draft
    if (!dataset.draftReason || dataset.draftReason.validationMode === 'never') {
      // nothing to do
    } else {
      patch._validateDraft = true

      const datasetFull = await app.get('db').collection('datasets').findOne({ id: dataset.id })
      Object.assign(datasetFull.draft, patch)
      const datasetDraft = datasetUtils.mergeDraft({ ...datasetFull })
      const breakingChanges = require('../datasets/utils/schema').getSchemaBreakingChanges(datasetFull.schema, datasetDraft.schema)
      if (breakingChanges.length) {
        let breakingChangesMessage = 'La structure du nouveau fichier contient des ruptures de compatibilité :'
        for (const breakingChange of breakingChanges) {
          breakingChangesMessage += '\n<br>' + req.__({ phrase: 'breakingChanges.' + breakingChange.type, locale: config.locale.default }, { title: datasetDraft.title, key: breakingChange.key })
        }
        await journals.log(app, dataset, { type: 'error', data: breakingChangesMessage })
        if (dataset.draftReason.validationMode === 'noBreakingChange' || dataset.draftReason.validationMode === 'compatible') {
          delete patch._validateDraft
        }
      } else if (!require('../datasets/utils/schema').schemasFullyCompatible(datasetFull.schema, datasetDraft.schema, true)) {
        await journals.log(app, dataset, { type: 'error', data: 'La structure du nouveau fichier contient des changements.' })
        if (dataset.draftReason.validationMode === 'compatible') {
          delete patch._validateDraft
        }
      }
    }
  }

  debug('Run validator stream')
  const progress = taskProgress(app, dataset.id, exports.eventsPrefix, 100)
  await progress(0)
  const readStreams = await datasetUtils.readStreams(db, dataset, false, false, false, progress)
  const validateStream = new ValidateStream({ dataset })
  await pump(...readStreams, validateStream)
  debug('Validator stream ok')

  const errorsSummary = validateStream.errorsSummary()
  if (errorsSummary) {
    await journals.log(app, dataset, { type: 'error', data: errorsSummary })
    delete patch._validateDraft
  }

  await datasetsService.applyPatch(app, dataset, patch)
}
