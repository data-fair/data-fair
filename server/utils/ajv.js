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
      // complete message based on extra parameters https://ajv.js.org/api.html#error-parameters
      for (const error of validate.errors) {
        if (error.keyword === 'additionalProperties') {
          error.message += ` (${error.params.additionalProperty})`
        }
      }
      const errors = ajv.errorsText(validate.errors, {
        separator: ', ',
        dataVar: ''
      })
      if (throws) {
        throw createError(400, errors)
      } else {
        myValidate.errors = errors
        return false
      }
    }
    return true
  }

  return myValidate
}
