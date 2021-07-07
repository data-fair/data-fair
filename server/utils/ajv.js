// TODO: ue something like this when upgrading to ajv 8

/* const createError = require('http-errors')
const Ajv = require('ajv')
const localize = require('ajv-i18n')
const addFormats = require('ajv-formats')
const ajv = new Ajv({ allErrors: true, messages: false })

addFormats(ajv)

exports.compile = (schema) => {
  const validate = ajv.compile(schema)
  return (data, locale = 'fr') => {
    const valid = validate(data)
    if (!valid) {
      (localize[locale] || localize.fr)(validate.errors)
      throw createError(400, ajv.errorsText(validate.errors, { separator: '\n' }))
    }
  }
}
 */
