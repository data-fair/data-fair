const { Transform } = require('stream')

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
exports.hasBOM = function (buffer) {
  return buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
exports.removeBOM = function (buffer) {
  // multiple strip BOM because of badly formatted files from some clients
  while (exports.hasBOM(buffer)) {
    buffer = buffer.slice(3)
  }
  return buffer
}

class RemoveBOMStream extends Transform {
  constructor () {
    super()
    this.firstChunk = true
  }

  _transform (chunk, encoding, callback) {
    if (this.firstChunk) {
      this.firstChunk = false
      callback(null, exports.removeBOM(chunk))
    } else {
      callback(null, chunk)
    }
  }
}

exports.RemoveBOMStream = RemoveBOMStream
