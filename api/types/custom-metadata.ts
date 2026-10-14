export type CustomMetadataType = 'string' | 'integer' | 'number' | 'date' | 'link'
export type CustomMetadataDefinition = {
  key?: string
  title: string
  type?: CustomMetadataType
  multiple?: boolean
  enum?: string[]
  group?: string
  description?: string
}

const typeOf = (definition: CustomMetadataDefinition) => definition.type ?? 'string'
const isList = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.enum?.length
const isMultiple = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.multiple

const expected = { string: 'texte attendu', integer: 'nombre entier attendu', number: 'nombre attendu', date: 'date attendue (AAAA-MM-JJ)', link: 'adresse web attendue (http:// ou https://)' }

const itemSchema = (definition: CustomMetadataDefinition): Record<string, any> => {
  switch (typeOf(definition)) {
    case 'integer': return { type: 'integer' }
    case 'number': return { type: 'number' }
    case 'date': return { type: 'string', format: 'date' }
    case 'link': return {
      type: 'object',
      required: ['url'],
      additionalProperties: false,
      properties: { url: { type: 'string', pattern: '^https?://\\S+$', errorMessage: expected.link }, title: { type: 'string' } }
    }
    default: return isList(definition) ? { type: 'string', enum: definition.enum } : { type: 'string' }
  }
}

/** JSON schema of dataset.customMetadata, shared by the API validation (ajv) and the UI form (vjsf). */
export const customMetadataSchema = (definitions: CustomMetadataDefinition[]) => ({
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(definitions.filter(d => d.key).map(definition => [definition.key, {
    title: definition.title,
    ...(definition.description && { description: definition.description }),
    ...(isMultiple(definition) ? { type: 'array', items: itemSchema(definition) } : itemSchema(definition)),
    // object form: json-layout adds its own per-property required messages to it
    errorMessage: typeOf(definition) === 'link'
      ? { type: expected.link, required: { url: expected.link }, additionalProperties: expected.link }
      : isList(definition) ? 'valeur absente de la liste' : expected[typeOf(definition)]
  }]))
} as Record<string, any>)

const formatItem = (item: any): string =>
  item?.url ? (item.title ? `${item.title} (${item.url})` : item.url) : String(item)

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
    // a cleared title field sends null
    if (item.title === '' || item.title === null) delete item.title
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
