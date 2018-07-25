const owner = require('./owner')
const eventBy = require('./event-by')
const publicationSchema = require('./publication')

module.exports = {
  'title': 'Application configuration',
  'type': 'object',
  'additionalProperties': false,
  'required': ['id', 'owner', 'url'],
  'properties': {
    'id': {
      'type': 'string',
      'description': 'Identifier of the application configuration'
    },
    href: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be fetched'
    },
    page: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be viewed in the UI'
    },
    'title': {
      'type': 'string',
      'description': 'Short title of the application configuration'
    },
    'description': {
      'type': 'string',
      'description': 'Detailed description of the application configuration'
    },
    'applicationName': {
      'type': 'string',
      'description': 'Identifier of the origin application'
    },
    'createdBy': eventBy,
    'updatedBy': eventBy,
    'createdAt': {
      'type': 'string',
      'description': 'Creation date of this application configuration',
      'format': 'date-time'
    },
    'updatedAt': {
      'type': 'string',
      'description': 'Date of the last update for this application configuration',
      'format': 'date-time'
    },
    owner,
    'configuration': {
      type: 'object',
      description: 'A free format configuration object used by applications. A minimal common structure is used to ensure proper linking between applications and datasets and remote services',
      additionalProperties: true,
      properties: {
        datasets: {
          type: 'array',
          items: {
            type: 'object',
            required: ['href'],
            properties: {
              href: {
                type: 'string'
              },
              key: {
                type: 'string',
                description: 'Not the id of the dataset, but a key inside this configuration object to define the role of the dataset in this context.'
              },
              name: {
                type: 'string'
              }
            }
          }
        },
        remoteServices: {
          type: 'array',
          items: {
            type: 'object',
            required: ['href'],
            properties: {
              href: {
                type: 'string'
              },
              key: {
                type: 'string',
                description: 'Not the id of the dataset, but a key inside this configuration object to define the role of the dataset in this context.'
              },
              name: {
                type: 'string'
              }
            }
          }
        }
      }
    },
    'url': {
      'type': 'string',
      'description': 'The URL the application is located to'
    },
    publications: {
      type: 'array',
      description: 'References to all the catalogs the application metadata is published too',
      items: publicationSchema
    }
  }
}
