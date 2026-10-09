export type CustomMetadataType = 'string' | 'integer' | 'number' | 'date' | 'link'
export type CustomMetadataDefinition = {
  key?: string
  title: string
  type?: CustomMetadataType
  multiple?: boolean
  enum?: { code?: string, label: string }[]
  group?: string
  description?: string
}

const typeOf = (definition: CustomMetadataDefinition) => definition.type ?? 'string'
const isList = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.enum?.length
export const isMultiple = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.multiple

// read by ajv-errors on the API, ignored by the UI fit check
const expected = { string: 'texte attendu', integer: 'nombre entier attendu', number: 'nombre attendu', date: 'date attendue (AAAA-MM-JJ)', link: 'adresse web attendue (http:// ou https://)' }

const itemSchema = (definition: CustomMetadataDefinition) => {
  if (isList(definition)) {
    return {
      type: 'object',
      required: ['code'],
      additionalProperties: false,
      properties: { code: { type: 'string', enum: definition.enum!.map(e => e.code) }, label: { type: 'string' } },
      errorMessage: `${definition.title} : valeur absente de la liste`
    }
  }
  const errorMessage = `${definition.title} : ${expected[typeOf(definition)]}`
  switch (typeOf(definition)) {
    case 'date': return { type: 'string', format: 'date', errorMessage }
    case 'link': return {
      type: 'object',
      required: ['url'],
      additionalProperties: false,
      properties: { url: { type: 'string', pattern: '^https?://\\S+$' }, title: { type: 'string' } },
      errorMessage
    }
    default: return { type: typeOf(definition), errorMessage }
  }
}

/** JSON schema of one custom metadata value. */
export const customMetadataDefinitionSchema = (definition: CustomMetadataDefinition) => ({
  title: definition.title,
  ...(isMultiple(definition) ? { type: 'array', items: itemSchema(definition) } : itemSchema(definition))
})

/** JSON schema of a dataset's customMetadata, built from the owner's definitions. */
export const customMetadataSchema = (definitions: CustomMetadataDefinition[]) => ({
  type: 'object',
  properties: Object.fromEntries(definitions.filter(d => d.key).map(d => [d.key, customMetadataDefinitionSchema(d)]))
})

// a list value is stored whole, with the label the definition has when it is written
export const withCurrentLabels = (definition: CustomMetadataDefinition, value: any): unknown => {
  if (!isList(definition)) return value
  const labelled = (item: { code: string }) => ({ code: item.code, label: definition.enum!.find(e => e.code === item.code)?.label ?? '' })
  return Array.isArray(value) ? value.map(labelled) : labelled(value)
}

const formatItem = (item: any): string =>
  item?.code !== undefined ? item.label : item?.url ? (item.title ? `${item.title} (${item.url})` : item.url) : String(item)

/** Display text of a value already known to fit its definition. */
export const formatCustomMetadata = (value: unknown): string =>
  Array.isArray(value) ? value.map(formatItem).join(', ') : formatItem(value)

export const isCustomMetadataEmpty = (value: any) =>
  value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length) ||
  (typeof value === 'object' && !Array.isArray(value) && 'url' in value && !value.url?.trim?.())

const trimItem = (item: any) => {
  if (typeof item === 'string') return item.trim()
  if (item && typeof item === 'object') {
    for (const key of ['url', 'title']) if (typeof item[key] === 'string') item[key] = item[key].trim()
    if (item.title === '') delete item.title
  }
  return item
}

// run before validation, so '  ' is never accepted as a value
export const trimCustomMetadata = (customMetadata: Record<string, any>) => {
  for (const [key, value] of Object.entries(customMetadata)) {
    const trimmed = Array.isArray(value) ? value.map(trimItem).filter(item => item !== '') : trimItem(value)
    if (isCustomMetadataEmpty(trimmed)) delete customMetadata[key]
    else customMetadata[key] = trimmed
  }
}
