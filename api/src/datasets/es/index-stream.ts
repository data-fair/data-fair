import { Transform, type TransformCallback } from 'stream'
import config from '#config'
import truncateMiddle from 'truncate-middle'
import * as extensionsUtils from '../utils/extensions.ts'
import { nanoid } from 'nanoid'
import debugLib from 'debug'
import es from '#es'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { Dataset } from '#types'

const debug = debugLib('index-stream')

interface IndexStreamOptions {
  dataset: Dataset
  indexName: string
  refresh?: boolean | string
  updateMode?: boolean
  attachments?: boolean
  // re-emit indexed lines on the readable side. Only the REST path consumes them
  // (markIndexedStream); file datasets pipe into a no-op sink, so skipping the
  // re-emit avoids a full per-line object copy.
  reemit?: boolean
}

// remove some properties that must not be indexed
const cleanItem = (item: any) => {
  // these properties are only for internal management of rest dataset
  delete item._hash
  delete item._needsIndexing
  delete item._needsExtending
  delete item._needsHistorizing
  delete item._deleted
}

const maxErroredItems = 3

class IndexStream extends Transform {
  options: IndexStreamOptions
  // pre-serialized ndjson lines for the ES bulk request. Serializing here (instead of
  // letting the ES client serialize the objects) means each line is stringified exactly
  // once: the string is used both for the maxBulkChars accounting and for the request
  // (the transport's ndserialize passes strings through untouched).
  body: string[]
  // the line objects of the current batch, one entry per bulk operation, kept for
  // error reporting and (REST only) re-emitting on the readable side
  items: any[]
  applyCalculations: (item: any) => Promise<string | null>
  bulkChars: number
  i: number
  nbErroredItems: number
  erroredItems: any[]

  constructor (options: IndexStreamOptions) {
    super({ objectMode: true })
    this.options = options
    this.options.refresh = this.options.refresh || false
    this.options.reemit = this.options.reemit ?? true
    this.applyCalculations = extensionsUtils.prepareCalculations(options.dataset)
    this.body = []
    this.items = []
    this.bulkChars = 0
    this.i = 0
    this.nbErroredItems = 0
    this.erroredItems = []
  }

  async transformPromise (item: any, encoding?: BufferEncoding) {
    let warning
    if (this.options.updateMode) {
      warning = await this.applyCalculations(item.doc)
      const keys = Object.keys(item.doc)
      if (keys.length === 0 || (keys.length === 1 && keys[0] === '_i')) return
      this.body.push(JSON.stringify({ update: { _index: this.options.indexName, _id: item.id, retry_on_conflict: 3 } }))
      const docStr = JSON.stringify({ doc: cleanItem(item.doc) })
      this.body.push(docStr)
      this.items.push(item.doc)
      this.bulkChars += docStr.length
    } else if (item._deleted) {
      this.body.push(JSON.stringify({ delete: { _index: this.options.indexName, _id: item._id } }))
      this.items.push(item)
    } else {
      cleanItem(item)
      const params: any = { index: { _index: this.options.indexName } }
      // nanoid will prevent risks of collision even when assembling in virtual datasets
      params.index._id = item._id || nanoid()
      delete item._id
      warning = await this.applyCalculations(item)
      this.body.push(JSON.stringify(params))
      const itemStr = JSON.stringify(item)
      this.body.push(itemStr)
      this.items.push(item)
      this.bulkChars += itemStr.length
    }
    if (warning) {
      this.nbErroredItems += 1
      if (this.erroredItems.length < maxErroredItems) this.erroredItems.push({ customMessage: warning, _i: this.i + 1 })
    }

    this.i += 1

    if (
      this.items.length >= config.elasticsearch.maxBulkLines ||
        this.bulkChars >= config.elasticsearch.maxBulkChars
    ) {
      await this.sendBulk()
    }
  }

  _transform (item: any, encoding: BufferEncoding, cb: TransformCallback) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.transformPromise(item, encoding).then(() => cb(), cb)
  }

  _final (cb: (error?: Error | null) => void) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.sendBulk()
      .then(() => {
        if (this.options.refresh) return
        return es.client.indices.refresh({ index: this.options.indexName }).catch(() => {
          // refresh can take some time on large datasets, try one more time
          return new Promise(resolve => setTimeout(resolve, 30000)).finally(() => {
            return es.client.indices.refresh({ index: this.options.indexName }).catch(err => {
              internalError('es-refresh-index', err)
              throw new Error('Échec pendant le rafraichissement de la donnée après indexation.')
            })
          })
        })
      })
      .then(() => cb(), cb)
  }

  async sendBulk () {
    if (this.items.length === 0) return
    debug(`Send ${this.items.length} lines to bulk indexing`)
    const bulkOpts: any = {
      body: this.body,
      timeout: '4m',
      refresh: this.options.refresh
    }
    try {
      // Use the ingest plugin to parse attached files
      if (this.options.attachments) bulkOpts.pipeline = 'attachment'
      const res: any = await es.client.bulk(bulkOpts)
      debug('Bulk sent OK')
      if (this.options.reemit) {
        for (let i = 0; i < res.items.length; i++) {
          const item = res.items[i]
          const _id = (item.index && item.index._id) || (item.update && item.update._id) || (item.delete && item.delete._id)
          this.push({ _id, ...this.items[i] })
        }
      }
      if (res.errors) {
        for (let i = 0; i < res.items.length; i++) {
          const item = {
            _i: this.items[i]._i,
            error: (res.items[i].index && res.items[i].index.error) || (res.items[i].update && res.items[i].update.error),
            input: this.items[i]
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
      this.items = []
      this.bulkChars = 0
    } catch (err) {
      internalError('es-bulk-index', err)
      throw new Error('Échec pendant l\'indexation d\'un paquet de données.')
    }
  }

  errorsSummary () {
    if (!this.nbErroredItems) return null
    const leftOutErrors = this.nbErroredItems - 3
    let msg = `${Math.round(100 * (this.nbErroredItems / this.i))}% des lignes sont en erreur.\n<br>`
    msg += this.erroredItems.map((item: any) => {
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

export default (options: IndexStreamOptions) => new IndexStream(options)
