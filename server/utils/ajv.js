const createError = require('http-errors')
const Ajv = require('ajv')
const localize = require('ajv-i18n')
const addFormats = require('ajv-formats')
const ajv = new Ajv({ allErrors: true, messages: false, strict: false })

addFormats(ajv)

exports.compile = (schema, throws = true) => {
  const validate = ajv.compile(schema)
  const myValidate = (data, locale = 'fr', errorsCallback) => {
    const valid = validate(data)
    if (!valid) {
      if (errorsCallback) errorsCallback(validate.errors);
      (localize[locale] || localize.fr)(validate.errors)
      if (throws) {
        throw createError(400, ajv.errorsText(validate.errors, { separator: '\n' }))
      } else {
        myValidate.errors = ajv.errorsText(validate.errors, { separator: '\n' })
        return false
      }
    }
    return true
  }

  return myValidate
}
