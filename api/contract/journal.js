export default {
  type: 'object',
  title: 'Journal',
  description: 'Journal d\'événements d\'une ressource.',
  required: ['id', 'type', 'events'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifiant de la ressource.'
    },
    type: {
      type: 'string',
      description: 'Type de ressource concernée par l\'événement.',
      enum: ['dataset', 'application', 'remote-service', 'catalog']
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'date'],
        properties: {
          type: {
            type: 'string'
          },
          date: {
            type: 'string',
            format: 'date-time'
          },
          data: {
            type: 'string'
          },
          draft: {
            type: 'boolean'
          }
        }
      }
    }
  }
}
