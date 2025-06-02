import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import applicationSchema from '#types/application/schema.js'

const body = jsonSchema(applicationSchema)
  .removeFromRequired(['id', 'slug', 'owner'])
  .set({ 'x-exports': ['validate', 'types'] })
  .removeId()
  .schema

export default {
  $id: 'https://github.com/data-fair/data-fair/applications/post-req',
  title: 'Post application req',
  'x-exports': ['validate', 'types'],
  type: 'object',
  required: ['body'],
  properties: { body }
}
