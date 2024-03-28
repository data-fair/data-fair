const { Transform } = require('stream')

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
exports.removeBOM = function (buffer) {
  // multiple strip BOM because of badly formatted files from some clients
  while (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
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
      chunk = exports.removeBOM(chunk)
    }
    callback(null, chunk)
  }
}

exports.RemoveBOMStream = RemoveBOMStream
