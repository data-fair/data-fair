import datasetSchema from '#types/dataset/schema.js'
import datasetPatch from '../patch-req/schema.js'

const body = {
  title: 'Post dataset body',
  type: 'object',
  additionalProperties: false,
  properties: {
    ...datasetPatch.properties.body.properties,
    initFrom: { $ref: '#/$defs/initFrom' },
    isVirtual: datasetSchema.properties.isVirtual,
    isRest: datasetSchema.properties.isRest,
    isMetaOnly: datasetSchema.properties.isMetaOnly,
    owner: datasetSchema.properties.owner
  }
}

export default {
  $id: 'https://github.com/data-fair/data-fair/datasets/post-req',
  title: 'Post dataset req',
  'x-exports': ['validate', 'types', 'resolvedSchema'],
  type: 'object',
  required: ['body'],
  properties: {
    body,
    file: {
      type: 'string',
      format: 'binary'
    },
    attachments: {
      type: 'string',
      format: 'binary'
    }
  },
  $defs: {
    ...datasetSchema.$defs,
    initFrom: {
      type: 'object',
      title: 'Init from',
      additionalProperties: false,
      required: ['dataset', 'parts'],
      properties: {
        dataset: {
          type: 'string'
        },
        parts: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['data', 'description', 'schema', 'metadataAttachments', 'primaryKey', 'extensions']
          }
        }
      }
    }
  }
}
