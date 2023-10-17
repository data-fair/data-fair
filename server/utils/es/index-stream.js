const { Transform } = require('stream')
const path = require('path')
const fs = require('fs-extra')
const config = require('config')
const truncateMiddle = require('truncate-middle')
const flatten = require('flat')
const datasetUtils = require('../dataset')
const geoUtils = require('../geo')
const prometheus = require('../prometheus')
const randomSeed = require('random-seed')
const { nanoid } = require('nanoid')

const debug = require('debug')('index-stream')

// remove some properties that must not be indexed
const cleanItem = (item) => {
  // these properties are only for internal management of rest dataset
  delete item._hash
  delete item._needsIndexing
  delete item._needsExtending
  delete item._deleted
  delete item._updatedBy
}

const maxErroredItems = 3

class IndexStream extends Transform {
  constructor (options) {
    super({ objectMode: true })
    this.options = options
    this.body = []
    this.bulkChars = 0
    this.i = 0
    this.nbErroredItems = 0
    this.erroredItems = []
    this.parsedExpressions = {}
  }

  async _transform (item, encoding, callback) {
    try {
      let warning
      if (this.options.updateMode) {
        warning = await applyCalculations(this.options.dataset, this.parsedExpressions, item.doc)
        const keys = Object.keys(item.doc)
        if (keys.length === 0 || (keys.length === 1 && keys[0] === '_i')) return callback()
        this.body.push({ update: { _index: this.options.indexName, _id: item.id, retry_on_conflict: 3 } })
        cleanItem(item.doc)
        this.body.push({ doc: cleanItem(item.doc) })
        this.bulkChars += JSON.stringify(item.doc).length
      } else if (item._deleted) {
        const params = { delete: { _index: this.options.indexName, _id: item._id } }
        // kinda lame, but pushing the delete query twice keeps parity of the body size that we use in reporting results
        this.body.push(params)
        this.body.push(item)
      } else {
        cleanItem(item)
        const params = { index: { _index: this.options.indexName } }
        // nanoid will prevent risks of collision even when assembling in virtual datasets
        params.index._id = item._id || nanoid()
        delete item._id
        this.body.push(params)
        warning = await applyCalculations(this.options.dataset, this.parsedExpressions, item)
        this.body.push(item)
        this.bulkChars += JSON.stringify(item).length
      }
      if (warning) {
        this.nbErroredItems += 1
        if (this.erroredItems.length < maxErroredItems) this.erroredItems.push({ customMessage: warning, _i: this.i + 1 })
      }

      this.i += 1

      if (
        this.body.length / 2 >= config.elasticsearch.maxBulkLines ||
        this.bulkChars >= config.elasticsearch.maxBulkChars
      ) {
        await this._sendBulk()
      }
    } catch (err) {
      return callback(err)
    }
    callback()
  }

  _final (cb) {
    this._sendBulk()
      .then(() => {
        return this.options.esClient.indices.refresh({ index: this.options.indexName }).catch(() => {
          // refresh can take some time on large datasets, try one more time
          return new Promise(resolve => setTimeout(resolve, 30000)).finally(() => {
            return this.options.esClient.indices.refresh({ index: this.options.indexName }).catch(err => {
              prometheus.internalError.inc({ errorCode: 'es-refresh-index' })
              console.error('(es-refresh-index) Failure while refreshing index after indexing', err)
              throw new Error('Échec pendant le rafraichissement de la donnée après indexation.')
            })
          })
        })
      })
      .then(() => cb(), cb)
  }

  async _sendBulk () {
    if (this.body.length === 0) return
    debug(`Send ${this.body.length} lines to bulk indexing`)
    const bodyClone = [].concat(this.body)
    const sentBulkChars = this.bulkChars
    const bulkOpts = {
      // ES does not want the doc along with a delete instruction,
      // but we put it in body anyway for our outgoing/reporting logic
      body: this.body.filter(line => !line._deleted),
      timeout: '4m'
    }
    try {
      // Use the ingest plugin to parse attached files
      if (this.options.attachments) bulkOpts.pipeline = 'attachment'
      const res = (await this.options.esClient.bulk(bulkOpts)).body
      debug('Bulk sent OK')
      for (let i = 0; i < res.items.length; i++) {
        const item = res.items[i]
        const _id = (item.index && item.index._id) || (item.update && item.update._id) || (item.delete && item.delete._id)
        const line = this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1]
        this.push({ _id, ...line })
      }
      if (res.errors) {
        for (let i = 0; i < res.items.length; i++) {
          const item = {
            _i: (this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1])._i,
            error: (res.items[i].index && res.items[i].index.error) || (res.items[i].update && res.items[i].update.error),
            input: this.body[(i * 2) + 1]
          }
          if (!item.error) continue
          this.nbErroredItems += 1
          if (this.erroredItems.length < maxErroredItems) this.erroredItems.push(item)
        }
      }
      this.body = []
      this.bulkChars = 0
    } catch (err) {
      prometheus.internalError.inc({ errorCode: 'es-bulk-index' })
      console.error(`(es-bulk-index) Failure while sending bulk request for indexing: index=${this.options.indexName}, bulkChars=${sentBulkChars}, nbLines=${bodyClone.length / 2}`, err)
      throw new Error('Échec pendant l\'indexation d\'un paquet de données.')
    }
  }

  errorsSummary () {
    if (!this.nbErroredItems) return null
    const leftOutErrors = this.nbErroredItems - 3
    let msg = `${Math.round(100 * (this.nbErroredItems / this.i))}% des lignes sont en erreur.\n<br>`
    msg += this.erroredItems.map(item => {
      let itemMsg = ' - '
      if (item._i !== undefined) itemMsg += `Ligne ${item._i}: `
      if (item.customMessage) itemMsg += item.customMessage
      else if (item.error.caused_by) itemMsg += item.error.caused_by.reason
      else itemMsg += item.error.reason
      return truncateMiddle(itemMsg, 80, 60, '...')
    }).join('\n<br>')

    if (leftOutErrors > 0) msg += `\n<br>${leftOutErrors} autres erreurs...`
    // blocking if more than 50% lines are broken in a way
    if (this.nbErroredItems > this.i / 2) throw new Error(msg)
    return msg
  }
}

const applyCalculations = async (dataset, parsedExpressions, item) => {
  let warning = null
  const flatItem = flatten(item, { safe: true })

  // Add base64 content of attachments
  const attachmentField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (attachmentField && flatItem[attachmentField.key]) {
    const filePath = path.join(datasetUtils.attachmentsDir(dataset), flatItem[attachmentField.key])
    if (await fs.pathExists(filePath)) {
      const stats = await fs.stat(filePath)
      if (stats.size > config.defaultLimits.attachmentIndexed) {
        warning = 'Pièce jointe trop volumineuse pour être analysée'
      } else {
        item._attachment_url = `${config.publicUrl}/api/v1/datasets/${dataset.id}/attachments/${flatItem[attachmentField.key]}`
        if (!attachmentField['x-capabilities'] || attachmentField['x-capabilities'].indexAttachment !== false) {
          item._file_raw = (await fs.readFile(filePath)).toString('base64')
        }
      }
    }
  }

  // calculate geopoint and geometry fields depending on concepts
  if (geoUtils.schemaHasGeopoint(dataset.schema)) {
    try {
      Object.assign(item, geoUtils.latlon2fields(dataset, flatItem))
    } catch (err) {
      console.log('failure to parse geopoints', dataset.id, err, flatItem)
      return 'Coordonnée géographique non valide - ' + err.message
    }
  } else if (geoUtils.schemaHasGeometry(dataset.schema)) {
    try {
      Object.assign(item, await geoUtils.geometry2fields(dataset, flatItem))
    } catch (err) {
      console.log('failure to parse geometry', dataset.id, err, flatItem)
      return 'Géométrie non valide - ' + err.message
    }
  }

  // Add a pseudo-random number for random sorting (more natural distribution)
  item._rand = randomSeed.create(dataset.id + item._i)(1000000)

  // split the fields that have a separator in their schema
  for (const field of dataset.schema) {
    if (field.separator && item[field.key]) {
      item[field.key] = item[field.key].split(field.separator.trim()).map(part => part.trim())
    }
  }

  for (const field of dataset.schema) {
    if (field['x-constExpr']) {
      const { parser } = require('../expr-eval')
      parsedExpressions[field.key] = parsedExpressions[field.key] ?? parser.parse(field['x-constExpr'])
      item[field.key] = parsedExpressions[field.key].evaluate({ data: item })
    }
  }
  return warning
}

module.exports = (options) => new IndexStream(options)
