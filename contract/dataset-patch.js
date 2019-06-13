// A dataset patch is a subset of the dataset object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

const dataset = require('./dataset')
const patchKeys = ['schema', 'description', 'title', 'license', 'origin', 'extensions', 'publications', 'virtual', 'rest', 'extras', 'attachmentsAsImage', 'projection']
module.exports = {
  title: 'Dataset patch',
  type: 'object',
  additionalProperties: false,
  properties: {}
}
patchKeys.forEach(k => {
  module.exports.properties[k] = dataset.properties[k]
})
