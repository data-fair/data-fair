const { Transform } = require('stream')
const config = require('config')
const randomSeed = require('random-seed')

class IndexStream extends Transform {
  constructor(options) {
    super({ objectMode: true })
    this.options = options
    this.body = []
    this.bulkChars = 0
    this.i = 0
    this.erroredItems = []
  }
  _transform(item, encoding, callback) {
    try {
      if (this.options.stats) this.options.stats.count += 1

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
        this._sendBulk(callback)
      } else {
        callback()
      }
    } catch (err) {
      return callback(err)
    }
  }
  _final(callback) {
    this._sendBulk(err => {
      if (err) return callback(err)
      this.options.esClient.indices.refresh({ index: this.options.indexName }, callback)
    })
  }
  _sendBulk(callback) {
    if (this.body.length === 0) return callback()
    const bodyClone = [].concat(this.body)
    const sentBulkChars = this.bulkChars
    const bulkOpts = {
      // ES does not want the doc along with a delete instruction,
      // but we put it in body anyway for our outgoing/reporting logic
      body: this.body.filter(line => !line._deleted),
      timeout: '4m',
      requestTimeout: 300000
    }
    // Use the ingest plugin to parse attached files
    if (this.options.attachments) bulkOpts.pipeline = 'attachment'
    this.options.esClient.bulk(bulkOpts, (err, res) => {
      if (err) {
        console.error(`Failure while sending bulk request for indexing: index=${this.options.indexName}, bulkChars=${sentBulkChars}, nbLines=${bodyClone.length / 2}`, err.message)
        return callback(new Error(`Échec pendant l'indexation d'un paquet de données.`))
      }
      res.items.forEach((item, i) => {
        const _id = (item.index && item.index._id) || (item.update && item.update._id) || (item.delete && item.delete._id)
        const line = this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1]
        this.push({ _id, ...line })
      })
      if (res.errors) {
        res.items
          .map((item, i) => ({
            _i: (this.options.updateMode ? bodyClone[(i * 2) + 1].doc : bodyClone[(i * 2) + 1])._i,
            error: (item.index && item.index.error) || (item.update && item.update.error)
          }))
          .filter(item => !!item.error)
          .forEach(item => this.erroredItems.push(item))
      }
      callback()
    })
    this.body = []
    this.bulkChars = 0
  }
  errorsSummary() {
    if (!this.erroredItems.length) return null
    const leftOutErrors = this.erroredItems.length - 3
    let msg = this.erroredItems.slice(0, 3).map(item => {
      let itemMsg = ''
      if (item._i !== undefined) itemMsg += `Élément ${item._i} du jeu de données - `
      itemMsg += item.error.reason
      if (item.error.caused_by) itemMsg += ' - ' + item.error.caused_by.reason
      itemMsg += '\n' + JSON.stringify(item.input)
      return itemMsg
    }).join('\n')
    if (leftOutErrors > 0) msg += `\n${leftOutErrors} autres erreurs...`
    return msg
  }
}

module.exports = (options) => new IndexStream(options)
