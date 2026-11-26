export default {
  type: 'object',
  required: ['catalog', 'status'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    catalog: {
      type: 'string',
      description: 'Identifier of the target catalog of this publication.'
    },
    status: {
      type: 'string',
      description: 'Status telling whether the publication succeeded. If "published", the targetUrl property must be set. If "error", the error property must be set.',
      enum: ['waiting', 'published', 'error', 'deleted']
    },
    publishedAt: {
      type: 'string',
      description: 'Date of the last update of this publication.',
      format: 'date-time'
    },
    error: {
      type: 'string'
    },
    targetUrl: {
      type: 'string'
    },
    result: {
      type: 'object',
      description: 'Result of the publication. The structure of this object is free and depends on the catalog type.'
    }
  }
}
