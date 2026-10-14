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

export const typeOf = (definition: CustomMetadataDefinition) => definition.type ?? 'string'
export const isList = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.enum?.length
export const isMultiple = (definition: CustomMetadataDefinition) => typeOf(definition) === 'string' && !!definition.multiple

// a real calendar day, so 2026-02-31 is refused
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)

const isLink = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  typeof value.url === 'string' && /^https?:\/\/\S+$/.test(value.url) && (value.title === undefined || typeof value.title === 'string') &&
  Object.keys(value).every(key => key === 'url' || key === 'title')

const fitsItem = (definition: CustomMetadataDefinition, item: unknown) => {
  switch (typeOf(definition)) {
    case 'integer': return Number.isInteger(item)
    case 'number': return Number.isFinite(item)
    case 'date': return isDate(item)
    case 'link': return isLink(item)
    default: return typeof item === 'string' && (!isList(definition) || definition.enum!.includes(item))
  }
}

/** Whether a value fits its custom metadata definition, shared by the API check and the UI form. */
export const fitsCustomMetadata = (definition: CustomMetadataDefinition, value: unknown) =>
  isMultiple(definition) ? Array.isArray(value) && value.every(item => fitsItem(definition, item)) : fitsItem(definition, value)

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
