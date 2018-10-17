const Writable = require('stream').Writable
const config = require('config')
const randomSeed = require('random-seed')

class IndexStream extends Writable {
  constructor(options) {
    super({ objectMode: true })
    this.options = options
    this.body = []
    this.bulkChars = 0
    this.i = 0
    this.erroredItems = []
  }
  _write(item, encoding, callback) {
    if (this.options.stats) this.options.stats.count += 1

    if (this.options.updateMode) {
      const keys = Object.keys(item.doc)
      if (keys.length === 0 || (keys.length === 1 && keys[0] === '_i')) return callback()
      this.body.push({ update: { _index: this.options.indexName, _type: 'line', _id: item.id, retry_on_conflict: 3 } })
      this.body.push({ doc: item.doc })
      this.bulkChars += JSON.stringify(item.doc).length
    } else {
      this.body.push({ index: { _index: this.options.indexName, _type: 'line' } })
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
    const bulkOpts = { body: this.body, timeout: '4m', requestTimeout: 300000 }
    // Use the ingest plugin to parse attached files
    if (this.options.attachments) bulkOpts.pipeline = 'attachment'
    this.options.esClient.bulk(bulkOpts, (err, res) => {
      if (err) return callback(err)
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

exports.indexStream = (options) => new IndexStream(options)
