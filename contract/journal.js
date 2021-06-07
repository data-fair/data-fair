module.exports = {
  type: 'object',
  description: 'History journal of a resource',
  required: ['id', 'type', 'events'],
  properties: {
    id: {
      type: 'string',
      description: 'The id of the resource',
    },
    type: {
      type: 'string',
      description: 'The type of resource concerned by the event',
      enum: ['dataset', 'application', 'remote-service', 'catalog'],
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'date'],
        properties: {
          type: {
            type: 'string',
          },
          date: {
            type: 'string',
            format: 'date-time',
          },
          data: {
            type: 'string',
          },
          draft: {
            type: 'boolean',
          },
        },
      },
    },
  },
}
