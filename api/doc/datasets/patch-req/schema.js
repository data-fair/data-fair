import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import datasetSchema from '#types/dataset/schema.js'

export const patchKeys = ['schema', 'title', 'summary', 'description', 'slug', 'license', 'origin', 'image', 'extensions', 'publications', 'publicationSites', 'requestedPublicationSites', 'virtual', 'rest', 'extras', 'attachmentsAsImage', 'projection', 'attachments', 'topics', 'thumbnails', 'masterData', 'primaryKey', 'exports', 'spatial', 'temporal', 'frequency', 'keywords', 'analysis', 'remoteFile', 'readApiKey', 'nonBlockingValidation']

const body = jsonSchema(datasetSchema)
  .makePatchSchema(patchKeys)
  .schema

export default jsonSchema({
  $id: 'https://github.com/data-fair/data-fair/datasets/patch-req',
  title: 'Patch dataset req',
  'x-exports': ['validate', 'types', 'resolvedSchema'],
  type: 'object',
  required: ['body'],
  properties: { body }
}).addProperty('body', body).schema
