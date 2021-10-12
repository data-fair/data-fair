// A dataset post is a subset of the dataset object that can be pushed when initially creating it

const dataset = require('./dataset')
const datasetPatch = require('./dataset-patch')
const postKeys = ['isVirtual', 'isRest', 'isMetaOnly', 'owner']
const body = {
  title: 'Dataset JSON body',
  type: 'object',
  additionalProperties: false,
  properties: {
    ...datasetPatch.properties,
  },
}
postKeys.forEach(k => {
  body.properties[k] = dataset.properties[k]
})

module.exports = {
  title: 'Dataset post',
  type: 'object',
  additionalProperties: false,
  properties: {
    body,
    file: {
      type: 'string',
      format: 'binary',
    },
    attachments: {
      type: 'string',
      format: 'binary',
    },
  },
}
