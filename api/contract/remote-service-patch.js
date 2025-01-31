// A remote service patch is a subset of the remote service object
// It is the part that can be user defined and sent in a patch
// the rest is read only fields

import remoteService from './remote-service.js'

const patchKeys = ['apiDoc', 'apiKey', 'server', 'description', 'title', 'parameters', 'public', 'privateAccess', 'virtualDatasets']

const remoteServicePatch = {
  title: 'Remote service patch',
  type: 'object',
  additionalProperties: false,
  properties: {},
  definitions: remoteService.definitions
}

patchKeys.forEach(k => {
  remoteServicePatch.properties[k] = remoteService.properties[k]
})

export default remoteServicePatch
