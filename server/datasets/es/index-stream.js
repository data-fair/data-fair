import { Transform } from 'stream'
import config from '#config'
import truncateMiddle from 'truncate-middle'
import * as extensionsUtils from '../utils/extensions.js'
import * as metrics from '../../misc/utils/metrics.js'
import { nanoid } from 'nanoid'
import debugLib from 'debug'

const debug = debugLib('index-stream')

// remove some properties that must not be indexed
const cleanItem = (item) => {
  // these properties are only for internal management of rest dataset
  delete item._hash
  delete item._needsIndexing
  delete item._needsExtending
  delete item._deleted
}

const maxErroredItems = 3

class IndexStream extends Transform {
  constructor (options) {
    super({ objectMode: true })
    this.options = options
    this.options.refresh = this.options.refresh || false
    this.body = []
    this.bulkChars = 0
    this.i = 0
    this.nbErroredItems = 0
    this.erroredItems = []
  }

  async transformPromise (item, encoding) {
    let warning
    if (this.options.updateMode) {
      warning = await extensionsUtils.applyCalculations(this.options.dataset, item.doc)
      const keys = Object.keys(item.doc)
      if (keys.length === 0 || (keys.length === 1 && keys[0] === '_i')) return
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
      warning = await extensionsUtils.applyCalculations(this.options.dataset, item)
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
      await this.sendBulk()
    }
  }

  _transform (item, encoding, cb) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.transformPromise(item, encoding).then(() => cb(), cb)
  }

  _final (cb) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.sendBulk()
      .then(() => {
        if (this.options.refresh) return
        return this.options.esClient.indices.refresh({ index: this.options.indexName }).catch(() => {
          // refresh can take some time on large datasets, try one more time
          return new Promise(resolve => setTimeout(resolve, 30000)).finally(() => {
            return this.options.esClient.indices.refresh({ index: this.options.indexName }).catch(err => {
              metrics.internalError('es-refresh-index', err)
              throw new Error('Échec pendant le rafraichissement de la donnée après indexation.')
            })
          })
        })
      })
      .then(() => cb(), cb)
  }

  async sendBulk () {
    if (this.body.length === 0) return
    debug(`Send ${this.body.length} lines to bulk indexing`)
    const bodyClone = [].concat(this.body)
    const bulkOpts = {
      // ES does not want the doc along with a delete instruction,
      // but we put it in body anyway for our outgoing/reporting logic
      body: this.body.filter(line => !line._deleted),
      timeout: '4m',
      refresh: this.options.refresh
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

          // for some error we can fail immediately, for most we memorize them
          if (item.error.type === 'cluster_block_exception') {
            throw new Error(item.error.type ? `${item.error.type} - ${item.error.reason}` : item.error)
          } else {
            this.nbErroredItems += 1
            if (this.erroredItems.length < maxErroredItems) this.erroredItems.push(item)
          }
        }
      }
      this.body = []
      this.bulkChars = 0
    } catch (err) {
      metrics.internalError('es-bulk-index', err)
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
    if (this.nbErroredItems > this.i / 2) throw new Error('[noretry] ' + msg)
    return msg
  }
}

export default (options) => new IndexStream(options)
