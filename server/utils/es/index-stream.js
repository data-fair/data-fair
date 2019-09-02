const { Transform } = require('stream')
const config = require('config')
const randomSeed = require('random-seed')
const debug = require('debug')('index-stream')
class IndexStream extends Transform {
  constructor(options) {
    super({ objectMode: true })
    this.options = options
    this.body = []
    this.bulkChars = 0
    this.i = 0
    this.erroredItems = []
  }
  async _transform(item, encoding, callback) {
    try {
      if (this.options.updateMode) {
        const keys = Object.keys(item.doc)
        if (keys.length === 0 || (keys.length === 1 && keys[0] === '_i')) return callback()
        this.body.push({ update: { _index: this.options.indexName, _id: item.id, retry_on_conflict: 3 } })
        this.body.push({ doc: item.doc })
        this.bulkChars += JSON.stringify(item.doc).length
      } else if (item._deleted) {
        const params = { delete: { _index: this.options.indexName, _id: item._id } }
        // kinda lame, but pushing the delete query twice keeps parity of the body size that we use in reporting results
        this.body.push(params)
        this.body.push(item)
      } else {
        const params = { index: { _index: this.options.indexName } }
        if (item._id) {
          params.index._id = item._id
          delete item._id
        }
        this.body.push(params)
        // Add a pseudo-random number for random sorting (more natural distribution)
        item._rand = randomSeed.create(item._i)(1000000)
        this.body.push(item)
        this.bulkChars += JSON.stringify(item).length
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
  async _final(callback) {
    try {
      await this._sendBulk()
    } catch (err) {
      return callback(err)
    }

    try {
      await this.options.esClient.indices.refresh({ index: this.options.indexName })
    } catch (err) {
      // refresh can take some time on large datasets, try one more time
      await new Promise(resolve => setTimeout(resolve, 30000))
      try {
        await this.options.esClient.indices.refresh({ index: this.options.indexName })
      } catch (err) {
        console.error('Failure while refreshing index after indexing', err)
        return callback(new Error('Échec pendant le rafraichissement de la donnée après indexation.'))
      }
    }
    callback()
  }
  async _sendBulk() {
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
      const res = await this.options.esClient.bulk(bulkOpts)
      debug('Bulk sent OK ')
      res.items.forEach((item, i) => {
        const _id = (item.index && item.index._id) || (item.update && item.update._id) || (item.delete && item.delete._id)
        const line = this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1]
        this.push({ _id, ...line })
      })
      if (res.errors) {
        res.items
          .map((item, i) => ({
            _i: (this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1])._i,
            error: (item.index && item.index.error) || (item.update && item.update.error),
            input: this.body[(i * 2) + 1]
          }))
          .filter(item => !!item.error)
          .forEach(item => this.erroredItems.push(item))
      }
      this.body = []
      this.bulkChars = 0
    } catch (err) {
      console.error(`Failure while sending bulk request for indexing: index=${this.options.indexName}, bulkChars=${sentBulkChars}, nbLines=${bodyClone.length / 2}`, err)
      throw new Error(`Échec pendant l'indexation d'un paquet de données.`)
    }
  }
  errorsSummary() {
    if (!this.erroredItems.length) return null
    const leftOutErrors = this.erroredItems.length - 3
    let msg = `${Math.round(100 * (this.erroredItems.length / this.i))}% des lignes sont en erreur.\n<br>`
    msg += this.erroredItems.slice(0, 3).map(item => {
      let itemMsg = ' - '
      if (item._i !== undefined) itemMsg += `Ligne ${item._i}: `
      if (item.error.caused_by) itemMsg += item.error.caused_by.reason
      else itemMsg += item.error.reason
      return itemMsg
    }).join('\n<br>')

    if (leftOutErrors > 0) msg += `\n<br>${leftOutErrors} autres erreurs...`
    // blocking if more than 50% lines are broken in a way
    if (this.erroredItems.length > this.i / 2) throw new Error(msg)
    return msg
  }
}

module.exports = (options) => new IndexStream(options)
