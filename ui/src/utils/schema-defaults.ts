import clone from '@data-fair/lib-utils/clone.js'

// vjsf writes the schema defaults into its model, and only when a field is rendered:
// applied on both sides of a comparison, they stop reading as an edit
export const withSchemaDefaults = (value: any, schema: any): any => {
  if (value === undefined && 'default' in schema) return clone(schema.default)
  if (Array.isArray(value)) return schema.items ? value.map(item => withSchemaDefaults(item, schema.items)) : value
  if (!schema.properties || (value !== undefined && (value === null || typeof value !== 'object'))) return value
  const result = { ...value }
  for (const [key, prop] of Object.entries(schema.properties)) {
    const filled = withSchemaDefaults(value?.[key], prop)
    if (filled !== undefined) result[key] = filled
  }
  return value || Object.keys(result).length ? result : undefined
}
