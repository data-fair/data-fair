const rfdc = require('rfdc')
const clone = rfdc()

/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
module.exports = (obj) => {
  return clone(obj.__isProxy ? obj.__proxyTarget : obj)
}
