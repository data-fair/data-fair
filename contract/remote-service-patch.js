// A remote service patch is a subset of the remote service object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import remoteService from './remote-service.js'

const patchKeys = ['apiDoc', 'apiKey', 'server', 'description', 'title', 'parameters', 'public', 'privateAccess', 'virtualDatasets']
export default {
  title: 'Remote service patch',
  type: 'object',
  additionalProperties: false,
  properties: {},
  definitions: remoteService.definitions
}

patchKeys.forEach(k => {
   export constproperties[k] = remoteService.properties[k]
})
