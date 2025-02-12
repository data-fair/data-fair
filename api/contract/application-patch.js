// An application patch is a subset of the application object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import application from '../types/application/schema.js'
const patchKeys = ['configuration', 'url', 'urlDraft', 'description', 'image', 'slug', 'title', 'publications', 'publicationSites', 'requestedPublicationSites', 'extras', 'topics', 'preferLargeDisplay', 'attachments']

const appPatch = {
  title: 'Application patch',
  type: 'object',
  additionalProperties: false,
  /** @type {any} */
  properties: {}
}

patchKeys.forEach(k => {
  appPatch.properties[k] = { ...application.properties[k] }
  appPatch.properties[k].type = ['null', appPatch.properties[k].type]
})

export default appPatch
