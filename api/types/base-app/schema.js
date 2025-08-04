import owner from '../../contract/owner.js'

export default {
  $id: 'https://github.com/data-fair/data-fair/base-app',
  title: 'Base app',
  'x-exports': ['types'],
  type: 'object',
  required: ['id', 'url', 'meta', 'version', 'applicationName'],
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    applicationName: { type: 'string' },
    version: { type: 'string' },
    category: { type: 'string' },
    meta: {
      type: 'object'
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
    }
  }
}
