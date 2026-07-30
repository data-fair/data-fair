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

// resolve a JSON-pointer (e.g. "/attr3/1") against `data`, decoding the
// standard ~1 -> "/" and ~0 -> "~" escapes. Returns undefined when the path
// does not exist or when the pointer is empty (root).
export const valueAtPointer = (data, pointer) => {
  if (!pointer) return undefined
  let cur = data
  for (const rawKey of pointer.split('/').slice(1)) {
    if (cur === null || cur === undefined) return undefined
    const key = rawKey.replace(/~1/g, '/').replace(/~0/g, '~')
    cur = cur[key]
  }
  return cur
}

// keywords whose "offending value" is not a single field value worth showing:
// the value is the absence of a field (required/dependencies) or it is the
// parent object rather than the bad value (additionalProperties names the key
// in its params tail instead).
const noValueKeywords = new Set(['required', 'additionalProperties', 'dependencies', 'dependentRequired'])

const truncateValue = (str, max = 200) => str.length > max ? str.slice(0, max) + '…' : str

// temporary duplicate from @data-fair/lib/types/validation.js
// When `data` is provided, the value rejected at each error's instancePath is
// appended as " (valeur : …)" — same debugging context the validation
// diagnostic CSV carries, useful when the raw input is not otherwise available.
export const errorsText = (errors, varName = '', data = undefined) => {
  if (!errors || errors.length === 0) return 'No errors'
  return errors
    .map((e) => {
      let msg = `${varName}${e.instancePath} ${e.message}`.trim()
      // ajv-errors emits an "errorMessage" keyword whose params carry the underlying
      // ajv errors — surfacing them as "(errors=…)" leaks the regex/internals to the
      // user, so suppress the params tail in that case (but still show the value below).
      if (e.keyword !== 'errorMessage') {
        const paramKeys = Object.keys(e.params || {}).filter(key => {
          if (key === 'error') return false
          if (e.keyword === 'type' && key === 'type') return false
          return true
        })
        const params = paramKeys
          .map(key => paramKeys.length > 1 ? `${key}=${e.params[key]}` : e.params[key])
          .join(', ')
        if (params) msg += ` (${params})`
      }
      if (data !== undefined && e.instancePath && !noValueKeywords.has(e.keyword)) {
        const value = valueAtPointer(data, e.instancePath)
        if (value !== undefined) msg += ` (valeur : ${truncateValue(JSON.stringify(value))})`
      }
      return msg
    })
    .reduce((text, msg) => text + ', ' + msg)
}
