import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { customMetadataDefinitionSchema, type CustomMetadataDefinition } from '#api/types'

const ajv = new Ajv({ strict: false })
addFormats(ajv)
const validators = new Map<string, ReturnType<typeof ajv.compile>>()

// a value being typed shows an error until it fits its definition
export const fitsDefinition = (definition: CustomMetadataDefinition, value: unknown) => {
  if (value == null) return false
  const key = JSON.stringify(definition)
  if (!validators.has(key)) validators.set(key, ajv.compile(customMetadataDefinitionSchema(definition)))
  return validators.get(key)!(value)
}
