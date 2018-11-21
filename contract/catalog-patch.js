// A catalog patch is a subset of the catalog object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

const catalog = require('./catalog')
const patchKeys = ['apiKey', 'description', 'title', 'organization', 'extras']
module.exports = {
  title: 'Catalog patch',
  type: 'object',
  additionalProperties: false,
  properties: {}
}
patchKeys.forEach(k => {
  module.exports.properties[k] = catalog.properties[k]
})
