import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import remoteServiceSchema from '#types/remote-service/schema.js'

export const patchKeys = ['apiDoc', 'apiKey', 'server', 'description', 'title', 'parameters', 'public', 'privateAccess', 'virtualDatasets']

const body = jsonSchema(remoteServiceSchema)
  .makePatchSchema(patchKeys)
  .schema

export default {
  $id: 'https://github.com/data-fair/data-fair/remote-service/patch-req',
  title: 'Patch remote service req',
  'x-exports': ['validate', 'types', 'resolvedSchema'],
  type: 'object',
  required: ['body'],
  properties: { body }
}
