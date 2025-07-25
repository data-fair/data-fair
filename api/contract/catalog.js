import owner from './owner.js'
import eventBy from './event-by.js'
import { resolvedSchema as permissions } from '#types/permissions/index.js'
import * as catalogs from '../src/catalogs/plugins/index.js'

export default {
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
      enum: catalogs.connectors.map((/** @type {any} */i) => i.key)
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
    autoUpdate: {
      type: 'object',
      properties: {
        active: { type: 'boolean', default: false },
        nextUpdate: { type: 'string', format: 'date-time' },
        lastUpdate: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    permissions
  }
}
