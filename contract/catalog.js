const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const catalogs = require('../server/catalogs')

module.exports = {
  title: 'Catalog',
  description: 'A catalog configuration to publish metadatas from datasets, services and applications.',
  type: 'object',
  additionalProperties: false,
  required: ['url', 'type'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the configuration for a catalog'
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
      description: 'Short title of the configuration for a catalog'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the configuration for a catalog'
    },
    createdBy: eventBy,
    updatedBy: eventBy,
    createdAt: {
      type: 'string',
      description: 'Creation date of this configuration for a catalog',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this configuration for a catalog',
      format: 'date-time'
    },
    owner,
    url: {
      type: 'string',
      description: 'The base url of the catalog'
    },
    type: {
      type: 'string',
      description: 'The type of catalog',
      enum: catalogs.connectors.map(i => i.key)
    },
    logo: {
      type: 'string',
      description: 'A link to the logo of the catalog'
    },
    apiKey: {
      type: 'string',
      description: 'The value of the required api key'
    },
    organization: {
      type: 'object',
      description: 'Leave empty to write in a personal space, otherwise use the id of an organization that you have the right to write into.',
      properties: {
        id: {
          type: 'string'
        },
        name: {
          type: 'string'
        }
      }
    },
    datasetUrlTemplate: {
      type: 'string'
    },
    applicationUrlTemplate: {
      type: 'string'
    },
    dataFairBaseUrl: {
      type: 'string'
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair'
    },
    permissions
  }
}
