// Deprecated, replaced by the more generic out-of-character
// TODO: remove this if it is confirmed that it is not used anymore

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
    console.log('REMOVE 1 BOM')
    buffer = buffer.slice(3)
  }
  return buffer
}
