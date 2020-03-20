// A dataset post is a subset of the dataset object that can be pushed when initially creating it

const dataset = require('./dataset')
const datasetPatch = require('./dataset-patch')
const postKeys = ['isVirtual', 'isRest', 'owner']
module.exports = {
  title: 'Dataset post',
  type: 'object',
  additionalProperties: false,
  properties: {
    ...datasetPatch.properties
  }
}
postKeys.forEach(k => {
  module.exports.properties[k] = dataset.properties[k]
})

module.exports.properties.file = {
  type: 'string',
  format: 'binary'
}
