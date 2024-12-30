// A catalog patch is a subset of the catalog object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import catalog from './catalog.js'

const patchKeys = ['apiKey', 'description', 'title', 'organization', 'extras', 'datasetUrlTemplate', 'applicationUrlTemplate', 'dataFairBaseUrl', 'autoUpdate']

const catalogPatch = {
  title: 'Catalog patch',
  type: 'object',
  additionalProperties: false,
  /** @type {any} */
  properties: {}
}
patchKeys.forEach(k => {
  catalogPatch.properties[k] = catalog.properties[k]
})

export default catalogPatch
