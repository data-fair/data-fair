import { Transform } from 'node:stream'

// TODO: use this util in more places

export default (size) => {
  return new Transform({
    transform (line, encoding, callback) {
      this._batch = this._batch || []
      this._batch.push(line)
      if (this._batch.length >= size) {
        this.push(this._batch)
        this._batch = []
      }
      callback()
    },
    flush (callback) {
      if (this._batch && this._batch.length) {
        this.push(this._batch)
      }
      callback()
    },
    objectMode: true
  })
}
