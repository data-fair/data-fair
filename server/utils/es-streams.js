const Writable = require('stream').Writable
const config = require('config')

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
      if (Object.keys(item.doc).length === 0) return callback()
      this.body.push({ update: { _index: this.options.indexName, _type: 'line', _id: item.id, retry_on_conflict: 3 } })
      this.body.push({ doc: item.doc })
      this.bulkChars += JSON.stringify(item.doc).length
    } else {
      this.body.push({ index: { _index: this.options.indexName, _type: 'line' } })
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
    this._sendBulk(callback)
  }
  _sendBulk(callback) {
    if (this.body.length === 0) return callback()
    const bodyClone = [].concat(this.body)
    this.options.esClient.bulk({ body: this.body, refresh: 'wait_for' }, (err, res) => {
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
