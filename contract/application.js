const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const publicationSchema = require('./publication')
const configurationSchema = require('./app-configuration')

module.exports = {
  'title': 'Application configuration',
  'type': 'object',
  'additionalProperties': false,
  'required': ['url'],
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
    status: {
      type: 'string',
      enum: ['created', 'configured-draft', 'configured', 'error']
    },
    owner,
    'configuration': configurationSchema,
    configurationDraft: configurationSchema,
    'url': {
      'type': 'string',
      'description': 'The URL the base application is located to'
    },
    'urlDraft': {
      'type': 'string',
      'description': 'The URL the base application for the draft configuration is located to'
    },
    publications: {
      type: 'array',
      description: 'References to all the catalogs the application metadata is published too',
      items: publicationSchema
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair'
    },
    permissions
  }
}
