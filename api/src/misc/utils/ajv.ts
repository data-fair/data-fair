import fs from 'fs-extra'
import path from 'path'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { ajv, errorsText, localize } from '@data-fair/data-fair-shared/ajv.js'

// cf https://github.com/ajv-validator/ajv/issues/1745
let openApiSchemaStr = fs.readFileSync(path.resolve(import.meta.dirname, '../../../contract/openapi-3.1.json'), 'utf8')
openApiSchemaStr = openApiSchemaStr.replace(/"\$dynamicRef": "#meta"/g, '"$ref": "#/$defs/schema"')
const openApiSchema = JSON.parse(openApiSchemaStr)

ajv.addSchema(openApiSchema, 'openapi-3.1')

export type CustomAjvValidate = ((data: any, locale?: 'fr' | 'en', errorsCallback?: (err: any) => void) => boolean) & { errors?: string }

export const compile = (schema: any, throws = true) => {
  const validate = typeof schema === 'string' ? ajv.getSchema(schema) : ajv.compile(schema)
  const myValidate: CustomAjvValidate = (data, locale = 'fr', errorsCallback) => {
    const valid = validate(data)
    if (!valid) {
      if (errorsCallback) errorsCallback(validate.errors);
      // @ts-ignore
      (localize[locale] || localize.fr)(validate.errors)
      const message = errorsText(validate.errors) as string
      if (throws) {
        throw httpError(400, message)
      } else {
        myValidate.errors = message
        return false
      }
    }
    return true
  }

  return myValidate
}
