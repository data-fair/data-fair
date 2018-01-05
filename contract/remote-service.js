module.exports = {
  title: 'Remote service',
  description: 'An remote service must be described with the openAPI 3.0 specification. If the API is secured, there must be at least one api-key based security scheme available.',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'owner', 'apiDoc'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the configuration for an remote service'
    },
    title: {
      type: 'string',
      description: 'Short title of the configuration for an remote service'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the configuration for an remote service'
    },
    createdBy: {
      type: 'string',
      description: 'Id of the account that created this configuration for an remote service'
    },
    updatedBy: {
      type: 'string',
      description: 'Id of the account that last updated this configuration for an remote service'
    },
    createdAt: {
      type: 'string',
      description: 'Creation date of this configuration for an remote service',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this configuration for an remote service',
      format: 'date-time'
    },
    owner: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: {
          type: 'string',
          enum: ['user', 'organization'],
          description: 'If the owner is a user or an organization'
        },
        id: {
          type: 'string',
          description: 'Identifier of the owner of this configuration for an remote service'
        }
      }
    },
    permissions: require('./permissions.json'),
    // TODO replace this schema with the official one when available
    // see https://github.com/OAI/OpenAPI-Specification/issues/1032
    // apiDoc: require('swagger2openapi/schemas/openapi-3.0.json'),
    apiDoc: require('./openapi-3.0.json'),
    url: {
      type: 'string',
      description: 'The url to fetch the apiDoc. Can be used for refresh purpose'
    },
    apiKey: {
      type: 'string',
      description: 'The value of the required apiKey'
    },
    server: {
      type: 'string',
      description: 'URL of the selected server in the apiDoc servers property'
    },
    actions: {
      type: 'array'
    }
  }
}
