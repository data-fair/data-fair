type PartOf = { type: 'dataset' | 'application', id: string }

/**
 * The `partOf` listing param for a picker opened from a resource: the standalone resources plus the
 * fragments of the resource's family (its own fragments, or its siblings when it is itself a fragment).
 * Fragments are hidden from every listing by default, without this a parent could not pick them.
 */
export const pickerPartOf = (type: PartOf['type'], resource: { id: string, partOf?: PartOf }) => {
  const parent = resource.partOf ?? { type, id: resource.id }
  return `false,${parent.type}:${parent.id}`
}

const listingUrlRegexp = /api\/v1\/(datasets|applications)\?/

const withPartOf = (url: unknown, partOf: string) =>
  typeof url === 'string' && listingUrlRegexp.test(url) && !url.includes('partOf=') ? `${url}&partOf=${partOf}` : url

/**
 * Append a `partOf` param to every datasets or applications listing URL of an application
 * configuration schema (`x-fromUrl`, and `layout.getItems.url` of VJSF 3), so that the pickers of
 * the form also offer the application's fragments.
 * Mutates the schema. A URL that already filters on `partOf` is left alone.
 */
export const addPartOfToFromUrls = (schema: any, partOf: string) => {
  if (Array.isArray(schema)) {
    for (const item of schema) addPartOfToFromUrls(item, partOf)
  } else if (schema && typeof schema === 'object') {
    if ('x-fromUrl' in schema) schema['x-fromUrl'] = withPartOf(schema['x-fromUrl'], partOf)
    if (schema.getItems && typeof schema.getItems === 'object') schema.getItems.url = withPartOf(schema.getItems.url, partOf)
    for (const key of Object.keys(schema)) addPartOfToFromUrls(schema[key], partOf)
  }
  return schema
}
