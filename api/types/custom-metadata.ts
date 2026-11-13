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

const itemSchema = (definition: CustomMetadataDefinition): Record<string, any> => {
  switch (typeOf(definition)) {
    case 'integer': return { type: 'integer' }
    case 'number': return { type: 'number' }
    case 'date': return { type: 'string', format: 'date' }
    case 'link': return {
      type: 'object',
      required: ['url'],
      additionalProperties: false,
      properties: {
        url: {
          type: 'string',
          pattern: '^https?://\\S+$',
          errorMessage: 'web address expected (http:// or https://)',
          'x-i18n-errorMessage': { fr: 'adresse web attendue (http:// ou https://)' }
        },
        title: { type: 'string' }
      }
    }
    default: return isList(definition) ? { type: 'string', enum: definition.enum } : { type: 'string' }
  }
}

// the error message of a metadata, English with its French translation
const errorMessages = (definition: CustomMetadataDefinition): Record<string, any> => {
  switch (typeOf(definition)) {
    case 'integer': return {
      errorMessage: 'integer expected',
      'x-i18n-errorMessage': { fr: 'nombre entier attendu' }
    }
    case 'number': return {
      errorMessage: 'number expected',
      'x-i18n-errorMessage': { fr: 'nombre attendu' }
    }
    case 'date': return {
      errorMessage: 'date expected (YYYY-MM-DD)',
      'x-i18n-errorMessage': { fr: 'date attendue (AAAA-MM-JJ)' }
    }
    // object form: json-layout adds its own per-property required messages to it
    case 'link': return {
      errorMessage: {
        type: 'web address expected (http:// or https://)',
        required: { url: 'web address expected (http:// or https://)' },
        additionalProperties: 'web address expected (http:// or https://)'
      },
      'x-i18n-errorMessage': {
        fr: {
          type: 'adresse web attendue (http:// ou https://)',
          required: { url: 'adresse web attendue (http:// ou https://)' },
          additionalProperties: 'adresse web attendue (http:// ou https://)'
        }
      }
    }
    default: return isList(definition)
      ? { errorMessage: 'value not in the list', 'x-i18n-errorMessage': { fr: 'valeur absente de la liste' } }
      : { errorMessage: 'text expected', 'x-i18n-errorMessage': { fr: 'texte attendu' } }
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
    ...errorMessages(definition)
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
