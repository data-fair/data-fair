// @ts-nocheck
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import addErrors from 'ajv-errors'
import ajvI18n from 'ajv-i18n'

// keep `messages: true` (default) so ajv-errors can stamp the user-provided
// message (errorMessage keyword) onto the synthesized error before localization.
export const ajv = new Ajv({ allErrors: true, strict: false })

addFormats(ajv)
addErrors(ajv)

// Wrapped localizer that preserves the user's custom errorMessage values; the
// raw ajv-i18n localizers replace `e.message` with a generic "doit être valide
// selon le critère …" string for the synthesized `errorMessage` keyword.
const wrapLocalize = (raw) => (errors) => {
  if (!errors) return raw(errors)
  const customMessages = new Map()
  errors.forEach((e, i) => {
    if (e.keyword === 'errorMessage' && typeof e.message === 'string') {
      customMessages.set(i, e.message)
    }
  })
  raw(errors)
  customMessages.forEach((msg, i) => { errors[i].message = msg })
}
export const localize = new Proxy(ajvI18n, {
  get (target, prop) {
    const raw = target[prop]
    return typeof raw === 'function' ? wrapLocalize(raw) : raw
  }
})

// temporary duplicate from @data-fair/lib/types/validation.js
export const errorsText = (errors, varName = '') => {
  if (!errors || errors.length === 0) return 'No errors'
  return errors
    .map((e) => {
      let msg = `${varName}${e.instancePath} ${e.message}`.trim()
      // ajv-errors emits an "errorMessage" keyword whose params carry the underlying
      // ajv errors — surfacing them as "(errors=…)" leaks the regex/internals to the
      // user, so suppress the params tail in that case.
      if (e.keyword === 'errorMessage') return msg
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
