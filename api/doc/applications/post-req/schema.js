import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import applicationSchema from '#types/application/schema.js'

const body = jsonSchema(applicationSchema)
  .removeFromRequired(['id', 'slug', 'owner'])
  .set({ 'x-exports': ['validate', 'types'] })
  .removeId()
  .schema

body.properties['initFrom'] = {
  type: 'object',
  required: ['application'],
  properties: {
    application: {
      type: 'string'
    }
  }
}

export default {
  $id: 'https://github.com/data-fair/data-fair/applications/post-req',
  title: 'Post application req',
  'x-exports': ['validate', 'types'],
  type: 'object',
  required: ['body'],
  properties: { body }
}
