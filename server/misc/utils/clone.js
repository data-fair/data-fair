const rfdc = require('rfdc')
const clone = rfdc()

/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export default (obj) => {
  return clone(obj?.__isProxy ? obj.__proxyTarget : obj)
}
