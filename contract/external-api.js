module.exports = {
  title: 'External API',
  description: 'An external API must be described with the openAPI 3.0 specification. If the API is secured, there must be at least one api-key based security scheme available.',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'owner', 'apiDoc'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the API'
    },
    title: {
      type: 'string',
      description: 'Short title of the API'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the API'
    },
    createdBy: {
      type: 'string',
      description: 'Id of the account that created this API'
    },
    updatedBy: {
      type: 'string',
      description: 'Id of the account that last updated this API'
    },
    createdAt: {
      type: 'string',
      description: 'Creation date of this API',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this API',
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
          description: 'Identifier of the owner of this API'
        }
      }
    },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        description: 'Permission to do the operation with the gived operationId. If type and id are not set, then the operation is set to public.',
        additionalProperties: false,
        required: ['operationId'],
        properties: {
          type: {
            type: 'string',
            enum: ['user', 'organization'],
            description: 'If the entity is a user or an organization'
          },
          id: {
            type: 'string',
            description: 'Identifier of the entity'
          },
          operationId: {
            type: 'string',
            description: 'API operation that can be used'
          }
        }
      }
    },
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
