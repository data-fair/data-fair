const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const publicationSchema = require('./publication')
const configurationSchema = require('./app-configuration')
const topic = require('./topic')

module.exports = {
  title: 'Application',
  type: 'object',
  additionalProperties: false,
  required: ['url'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the application',
    },
    href: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be fetched',
    },
    page: {
      type: 'string',
      description: 'Readonly field. The URL where this resource can be viewed in the UI',
    },
    title: {
      type: 'string',
      description: 'Short title of the application',
    },
    description: {
      type: 'string',
      description: 'Detailed description of the application',
    },
    applicationName: {
      type: 'string',
      description: 'Identifier of the origin application',
    },
    createdBy: eventBy,
    updatedBy: eventBy,
    createdAt: {
      type: 'string',
      description: 'Creation date of this application',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this application',
      format: 'date-time',
    },
    lastConfigured: {
      type: 'string',
      description: 'Date of the last validation of a configuration for this application',
      format: 'date-time',
    },
    status: {
      type: 'string',
      enum: ['created', 'configured-draft', 'configured', 'error'],
    },
    owner,
    configuration: configurationSchema,
    configurationDraft: configurationSchema,
    url: {
      type: 'string',
      description: 'The URL the base application is located to',
    },
    urlDraft: {
      type: 'string',
      description: 'The URL the base application for the draft configuration is located to',
    },
    errorMessage: {
      type: 'string',
    },
    errorMessageDraft: {
      type: 'string',
    },
    publications: {
      type: 'array',
      description: 'References to all the catalogs the application metadata is published too',
      items: publicationSchema,
    },
    publicationSites: {
      type: 'array',
      description: 'References to all sites the application is exposed in.',
      items: {
        type: 'string',
      },
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic,
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair',
    },
    preferLargeDisplay: {
      type: 'boolean',
      default: false,
    },
    permissions,
  },
}
