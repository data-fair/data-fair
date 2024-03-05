class MutationError extends Error {
  /**
   * @param {string} message
   */
  constructor (message) {
    super(message)
    this.name = 'MutationError'
  }
}

/**
 * @template T
 * @param {T} target
 * @param {string} label
 * @returns {T}
 */
module.exports = (target, label) => {
  // this is not enforced in production, only during test and dev
  if (process.env.NODE_ENV === 'production') return target

  const proxyHandler = {
    get (target, key) {
      if (key === '__isProxy') return true
      if (key === '__proxyTarget') return target
      return typeof target[key] === 'object' && !(target[key] instanceof Date)
        ? new Proxy(target[key], proxyHandler)
        : target[key]
    },
    set (target, key, value) {
      throw new MutationError(`Attempt to modify immutable object: ${label} - ${key}`)
    },
    deleteProperty (target, key) {
      throw new MutationError(`Attempt to delete property from immutable object: ${label} - ${key}`)
    },
    defineProperty (target, key, descriptor) {
      throw new MutationError(`Attempt to define property on immutable object: ${label} - ${key}`)
    }
  }

  const proxy = new Proxy(target, proxyHandler)
  // proxy._originalTarget = target
  return proxy
}
