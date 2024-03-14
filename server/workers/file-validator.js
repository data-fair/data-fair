const { Writable } = require('stream')
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

  debug('Run validator stream')
  const progress = taskProgress(app, dataset.id, exports.eventsPrefix, 100)
  await progress(0)
  const readStreams = await datasetUtils.readStreams(db, dataset, false, false, false, progress)
  const validateStream = new ValidateStream({ dataset })
  await pump(...readStreams, validateStream)
  debug('Validator stream ok')

  const patch = { status: dataset.status === 'validation-updated' ? 'finalized' : 'validated' }

  const errorsSummary = validateStream.errorsSummary()
  if (errorsSummary) {
    await journals.log(app, dataset, { type: 'error', data: errorsSummary })
  } else {
    if (await datasetsService.validateCompatibleDraft(app, dataset, patch)) return
  }

  await datasetsService.applyPatch(app, dataset, patch)
}
