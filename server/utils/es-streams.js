const Writable = require('stream').Writable
const config = require('config')

class IndexStream extends Writable {
  constructor(options) {
    super({objectMode: true})
    this.options = options
    this.body = []
    this.bulkChars = 0
  }
  _write(item, encoding, callback) {
    if (this.options.stats) this.options.stats.count += 1

    if (this.options.updateMode) {
      if (Object.keys(item.doc).length === 0) return callback()
      this.body.push({update: {_index: this.options.indexName, _type: 'line', _id: item.id, retry_on_conflict: 3}})
      this.body.push({doc: item.doc})
      this.bulkChars += JSON.stringify(item.doc).length
    } else {
      this.body.push({index: {_index: this.options.indexName, _type: 'line'}})
      this.body.push(item)
      this.bulkChars += JSON.stringify(item).length
    }

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
    this._sendBulk(callback)
  }
  _sendBulk(callback) {
    if (this.body.length === 0) return callback()
    this.options.esClient.bulk({body: this.body, refresh: 'wait_for'}, (err, res) => {
      if (err) return callback(err)
      if (res.errors) {
        const msg = res.items
          .map(item => (item.index && item.index.error) || (item.update && item.update.error))
          .filter(err => !!err)
          .map(err => {
            let itemMsg = err.reason
            if (err.caused_by) itemMsg += ' - ' + err.caused_by.reason
            return itemMsg
          }).join('\n')
        return callback(new Error(msg))
      }
      callback()
    })
    this.body = []
    this.bulkChars = 0
  }
}

exports.indexStream = (options) => new IndexStream(options)
