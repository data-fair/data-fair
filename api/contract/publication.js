export default {
  type: 'object',
  required: ['catalogId', 'status'],
  additionalProperties: false,
  properties: {
    publicationId: {
      type: 'string',
      description: 'Id of this publication, for a better search in database'
    },
    catalogId: {
      type: 'string',
      description: 'Id of the catalog where the resource is published'
    },
    remoteDatasetId: {
      type: 'string',
      description: 'Id of the dataset in the remote catalog'
    },
    status: {
      type: 'string',
      description: 'A simple flag to clearly identify the publications that were successful. If "error" then the error key should be defined.',
      enum: ['waiting', 'published', 'error', 'deleted']
    },
    publishedAt: {
      type: 'string',
      description: 'Date of the last update for this publication',
      format: 'date-time'
    },
    error: {
      type: 'string'
    },
    isResource: {
      type: 'boolean',
      description: 'True if the publication is a resource, false or undefined if it is a dataset'
    }
  }
}
