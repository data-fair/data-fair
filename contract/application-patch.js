// An application patch is a subset of the application object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import application from './application.js'
const patchKeys = ['configuration', 'url', 'urlDraft', 'description', 'slug', 'title', 'publications', 'publicationSites', 'requestedPublicationSites', 'extras', 'topics', 'preferLargeDisplay']
export default {
  title: 'Application patch',
  type: 'object',
  additionalProperties: false,
  /** @type {any} */
  properties: {}
}
patchKeys.forEach(k => {
   export constproperties[k] = application.properties[k]
})
