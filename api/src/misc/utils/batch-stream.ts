import { Transform, type TransformCallback } from 'node:stream'

// TODO: use this util in more places

type BatchTransform = Transform & { _batch?: any[] }

export default (size: number) => {
  return new Transform({
    transform (this: BatchTransform, line: any, encoding: BufferEncoding, callback: TransformCallback) {
      this._batch = this._batch || []
      this._batch.push(line)
      if (this._batch.length >= size) {
        this.push(this._batch)
        this._batch = []
      }
      callback()
    },
    flush (this: BatchTransform, callback: TransformCallback) {
      if (this._batch && this._batch.length) {
        this.push(this._batch)
      }
      callback()
    },
    objectMode: true
  })
}
