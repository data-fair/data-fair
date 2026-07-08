// inspired by https://github.com/danielgindi/node-autodetect-decoder-stream/blob/master/index.js

import iconv, { type DecoderStream } from 'iconv-lite'
import { Transform, type TransformCallback } from 'stream'
import outOfCharacter from 'out-of-character'
import { detectEncoding } from './detect-encoding.ts'

const sampleSize = 32768 // 32kb

const iconvOpts = { stripBOM: false }

class DecodeStream extends Transform {
  _buffer?: Buffer
  decoder: DecoderStream | null

  constructor (encoding?: string) {
    super()
    this._buffer = Buffer.alloc(0)
    this.decoder = encoding ? iconv.getDecoder(encoding, iconvOpts) : null
  }

  processBuffer (chunk: Buffer | null, flush = false) {
    if (!this.decoder) {
      if (chunk) this._buffer = Buffer.concat([this._buffer!, chunk])
      if (this._buffer!.length > sampleSize || flush) {
        const encoding = detectEncoding(this._buffer!)
        this.decoder = iconv.getDecoder(encoding, iconvOpts)
        chunk = this._buffer!
        delete this._buffer
      }
    }
    if (this.decoder) {
      if (chunk) {
        const res = outOfCharacter.replace(this.decoder.write(chunk))
        this.push(res)
      }
      if (flush) {
        const res = this.decoder.end()
        this.push(res)
      }
    }
  }

  _transform (chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    this.processBuffer(chunk)
    callback()
  }

  _flush (callback: TransformCallback) {
    this.processBuffer(null, true)
    callback()
  }
}

export default DecodeStream
