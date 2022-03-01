// TODO replace this schema with the official one when available
// see https://github.com/OAI/OpenAPI-Specification/issues/1032
// apiDoc: require('swagger2openapi/schemas/openapi-3.0.json'),
const apiDoc = require('./openapi-3.1.json')

const owner = require('./owner')

module.exports = {
  title: 'Remote service',
  description: 'A remote service must be described with the openAPI 3.0 specification. If the API is secured, there must be at least one api-key based security scheme available.',
  type: 'object',
  additionalProperties: false,
  required: ['apiDoc', 'title'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the configuration for an remote service'
    },
    href: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be fetched'
    },
    page: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be viewed in the UI'
    },
    title: {
      type: 'string',
      description: 'Short title of the configuration for an remote service'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the configuration for an remote service'
    },
    apiDoc: { $ref: '#/definitions/API' },
    url: {
      type: 'string',
      description: 'The url to fetch the apiDoc. Can be used for refresh purpose'
    },
    apiKey: {
      type: 'object',
      additionalProperties: false,
      required: ['in'],
      properties: {
        in: {
          type: 'string',
          enum: ['query', 'header', 'cookie'],
          description: 'Where the api key is located'
        },
        name: {
          type: 'string',
          description: 'Identifier of the owner of this configuration for an remote service'
        },
        value: {
          type: 'string',
          description: 'The value of the required api key'
        }
      }
    },
    server: {
      type: 'string',
      description: 'URL of the selected server in the apiDoc servers property'
    },
    actions: {
      type: 'array'
    },
    public: {
      type: 'boolean'
    },
    privateAccess: {
      type: 'array',
      items: owner
    },
    parameters: {
      type: 'array',
      description: 'DEPRECATED. Some parameters name/values associations to send to all operations of the reverse proxy',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['operationId', 'name', 'value'],
        properties: {
          name: { type: 'string' },
          operationId: { type: 'string' },
          value: { type: 'string' },
          'x-refersTo': { type: 'string' },
          title: { type: 'string' }
        }
      }
    }
  },
  definitions: apiDoc.definitions
}
