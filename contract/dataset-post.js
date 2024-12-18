// A dataset post is a subset of the dataset object that can be pushed when initially creating it
import dataset from './dataset.js'
import datasetPatch from './dataset-patch.js'

const postKeys = ['isVirtual', 'isRest', 'isMetaOnly', 'owner', 'remoteFile']
const body = {
  title: 'Dataset JSON body',
  type: 'object',
  additionalProperties: false,
  properties: {
    ...datasetPatch.properties,
    initFrom: {
      type: 'object',
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
postKeys.forEach(k => {
  body.properties[k] = dataset.properties[k]
})

export default {
  title: 'Dataset post',
  type: 'object',
  additionalProperties: false,
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
  }
}
