import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import applicationSchema from '#types/application/schema.js'

export const patchKeys = ['configuration', 'url', 'urlDraft', 'description', 'image', 'slug', 'title', 'publications', 'publicationSites', 'requestedPublicationSites', 'extras', 'topics', 'preferLargeDisplay', 'attachments']

const body = jsonSchema(applicationSchema)
  .makePatchSchema(patchKeys)
  .schema

export default {
  $id: 'https://github.com/data-fair/data-fair/applications/patch-req',
  title: 'Patch application req',
  'x-exports': ['validate', 'types', 'resolvedSchema'],
  type: 'object',
  required: ['body'],
  properties: { body }
}
