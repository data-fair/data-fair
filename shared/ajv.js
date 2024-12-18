import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
export * as localize from 'ajv-i18n'

export const ajv = new Ajv({ allErrors: true, messages: false, strict: false })

addFormats(ajv)

// temporary duplicate from @data-fair/lib/types/validation.js
export const errorsText = (errors, varName = '') => {
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
