// inspired by https://github.com/danielgindi/node-autodetect-decoder-stream/blob/master/index.js

const iconv = require('iconv-lite')
const chardet = require('chardet')
const { Transform } = require('stream')
const outOfCharacter = require('out-of-character')

const sampleSize = 32768 // 32kb

const iconvOpts = { stripBOM: false }

class DecodeStream extends Transform {
  constructor (encoding) {
    super()
    this._buffer = Buffer.alloc(0)
    this.decoder = encoding ? iconv.getDecoder(encoding, iconvOpts) : null
  }

  processBuffer (chunk, flush = false) {
    if (!this.decoder) {
      if (chunk) this._buffer = Buffer.concat([this._buffer, chunk])
      if (this._buffer.length > sampleSize || flush) {
        const encoding = chardet.detect(this._buffer) ?? 'UTF-8'
        this.decoder = iconv.getDecoder(encoding, iconvOpts)
        chunk = this._buffer
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

  _transform (chunk, encoding, callback) {
    this.processBuffer(chunk)
    callback()
  }

  _flush (callback) {
    this.processBuffer(null, true)
    callback()
  }
}

module.exports = DecodeStream
