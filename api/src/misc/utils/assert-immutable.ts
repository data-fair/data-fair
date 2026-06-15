import config from '#config'

class MutationError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'MutationError'
  }
}

export default <T extends object>(target: T, label: string): T => {
  // this is not enforced in production, only during test and dev
  if (!config.assertImmutable) return target

  const proxyHandler: ProxyHandler<any> = {
    get (target: any, key: string | symbol) {
      if (key === '__isProxy') return true
      if (key === '__proxyTarget') return target
      if (typeof target[key] === 'object' && !(target[key] instanceof Date)) {
        try {
          return new Proxy(target[key], proxyHandler)
        } catch (err) {
          console.warn(`failed to create object proxy for key ${key as string}`, target[key], err)
        }
      }
      return target[key]
    },
    set (target: any, key: string | symbol, value: any) {
      throw new MutationError(`Attempt to modify immutable object: ${label} - ${key as string}`)
    },
    deleteProperty (target: any, key: string | symbol) {
      throw new MutationError(`Attempt to delete property from immutable object: ${label} - ${key as string}`)
    },
    defineProperty (target: any, key: string | symbol, descriptor: PropertyDescriptor) {
      throw new MutationError(`Attempt to define property on immutable object: ${label} - ${key as string}`)
    }
  }

  const proxy = new Proxy(target, proxyHandler)
  // proxy._originalTarget = target
  return proxy
}
