// Deprecated, replaced by the more generic out-of-character
// TODO: remove this if it is confirmed that it is not used anymore

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export const hasBOM = function (buffer: Buffer) {
  return buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export const removeBOM = function (buffer: Buffer) {
  // multiple strip BOM because of badly formatted files from some clients
  while (hasBOM(buffer)) {
    buffer = buffer.subarray(3)
  }
  return buffer
}
