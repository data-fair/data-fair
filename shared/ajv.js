const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')

exports.localize = require('ajv-i18n')

const ajv = exports.ajv = new Ajv({ allErrors: true, messages: false, strict: false })
addFormats(ajv)

// temporary duplicate from @data-fair/lib/types/validation.js
exports.errorsText = (errors, varName = '') => {
  if (!errors || errors.length === 0) return 'No errors'
  return errors
    .map((e) => {
      let msg = `${varName}${e.instancePath} ${e.message}`.trim()
      const paramKeys = Object.keys(e.params || {}).filter(key => {
        if (key === 'error') return false
        if (e.keyword === 'type' && key === 'type') return false
        return true
      })
      const params = paramKeys
        .map(key => paramKeys.length > 1 ? `${key}=${e.params[key]}` : e.params[key])
        .join(', ')
      if (params) msg += ` (${params})`
      return msg
    })
    .reduce((text, msg) => text + ', ' + msg)
}
