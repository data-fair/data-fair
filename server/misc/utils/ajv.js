const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const { ajv, errorsText, localize } = require('../../../shared/ajv')

// cf https://github.com/ajv-validator/ajv/issues/1745
let openApiSchemaStr = fs.readFileSync(path.join(__dirname, '../../../contract/openapi-3.1.json'), 'utf8')
openApiSchemaStr = openApiSchemaStr.replace(/"\$dynamicRef": "#meta"/g, '"$ref": "#/$defs/schema"')
const openApiSchema = JSON.parse(openApiSchemaStr)

ajv.addSchema(openApiSchema, 'openapi-3.1')

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
