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
    artefactId: {
      type: 'string',
      description: 'Registry artefact id of the base app (e.g. @koumoul/sankey@1.5). One mutable artefact per minor line.'
    },
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
      type: 'object',
      additionalProperties: { type: 'string' }
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
        type: 'object',
        additionalProperties: true,
        properties: {
          fromUrl: { type: 'string' },
          properties: { type: 'object', additionalProperties: true },
          bbox: { type: 'array', items: { type: 'string' } },
          concepts: { type: 'array', items: { type: 'string' } },
          'field-type': { type: 'array', items: { type: 'string' } },
          select: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    hasConfigSchema: {
      type: 'boolean'
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
