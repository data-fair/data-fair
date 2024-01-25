const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const Ajv = require('ajv/dist/2020')
const localize = require('ajv-i18n')
const addFormats = require('ajv-formats')

// cf https://github.com/ajv-validator/ajv/issues/1745
let openApiSchemaStr = fs.readFileSync(path.join(__dirname, '../../../contract/openapi-3.1.json'), 'utf8')
openApiSchemaStr = openApiSchemaStr.replace(/"\$dynamicRef": "#meta"/g, '"$ref": "#/$defs/schema"')
const openApiSchema = JSON.parse(openApiSchemaStr)

const ajv = new Ajv({ allErrors: true, messages: false, strict: false })
addFormats(ajv)
ajv.addSchema(openApiSchema, 'openapi-3.1')

// temporary duplicate from @data-fair/lib/types/validation.js
const errorsText = (errors, varName = '') => {
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

exports.compile = (schema, throws = true) => {
  const validate = typeof schema === 'string' ? ajv.getSchema(schema) : ajv.compile(schema)
  const myValidate = (data, locale = 'fr', errorsCallback) => {
    const valid = validate(data)
    if (!valid) {
      if (errorsCallback) errorsCallback(validate.errors);
      (localize[locale] || localize.fr)(validate.errors)
      const message = errorsText(validate.errors)
      if (throws) {
        throw createError(400, message)
      } else {
        myValidate.errors = message
        return false
      }
    }
    return true
  }

  return myValidate
}
