// A dataset patch is a subset of the dataset object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import dataset from './dataset.js'

const patchKeys = ['schema', 'description', 'title', 'slug', 'license', 'origin', 'image', 'extensions', 'publications', 'publicationSites', 'requestedPublicationSites', 'virtual', 'rest', 'extras', 'attachmentsAsImage', 'projection', 'attachments', 'topics', 'thumbnails', 'masterData', 'primaryKey', 'exports', 'spatial', 'temporal', 'frequency', 'keywords', 'analysis', 'remoteFile', 'readApiKey']
export default {
  title: 'Dataset patch',
  type: 'object',
  additionalProperties: false,
  /** @type {any} */
  properties: {}
}
patchKeys.forEach(k => {
   export constproperties[k] = { ...dataset.properties[k] }
   export constproperties[k].type = ['null',  export constproperties[k].type]
})
