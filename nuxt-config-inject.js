const flat = require('flat')
const replace = require('replace')
const debug = require('debug')('nuxt-config-inject')

const alias = key => `CONFIGALIAS/${key.replace(/\./g, '--')}/CONFIGALIAS`

exports.prepare = config => {
  const flatConfig = flat(config)
  Object.keys(flatConfig).forEach(key => {
    debug(`Use config alias ${key} -> ${alias(key)}`)
    flatConfig[key] = alias(key)
  })
  return flat.unflatten(flatConfig)
}

exports.replace = config => {
  const flatConfig = flat(config)
  Object.keys(flatConfig).forEach(key => {
    debug(`Replace config alias by value ${alias(key)} -> ${flatConfig[key]}`)
    replace({
      regex: alias(key),
      replacement: flatConfig[key],
      paths: ['.nuxt'],
      recursive: true,
      silent: true
    })
  })
}
