import owner from '../../contract/owner.js'

export default {
  $id: 'https://github.com/data-fair/data-fair/base-app',
  title: 'Base app',
  'x-exports': ['types'],
  'x-jstt': { additionalProperties: false },
  type: 'object',
  required: ['id', 'url', 'meta', 'version', 'applicationName'],
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    applicationName: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    image: { type: 'string' },
    thumbnail: {
      type: 'string',
      readOnly: true
    },
    documentation: { type: 'string' },
    version: { type: 'string' },
    category: { type: 'string' },
    meta: {
      type: 'object'
    },
    public: {
      type: 'boolean'
    },
    privateAccess: {
      type: 'array',
      items: owner
    },
    datasetsFilters: {
      type: 'array',
      items: {
        type: 'object'
      }
    },
    deprecated: {
      type: 'boolean'
    },
    nbApplications: {
      type: 'integer',
      readOnly: true
    }
  }
}
