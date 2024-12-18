import owner from './owner.js'
import eventBy from './event-by.js'
import permissions from './permissions.json'
import publicationSchema from './publication.js'
import configurationSchema from './app-configuration.js'
import topic from './topic.js'

const baseAppReference = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    meta: {
      type: 'object'
    }
  }
}

export default {
  title: 'Application',
  type: 'object',
  additionalProperties: false,
  required: ['url'],
  properties: {
    id: {
      type: 'string',
      description: 'Globally unique identifier of the application'
    },
    slug: {
      type: 'string',
      description: 'Identifier of the application, usually a slug for URL readability (unique inside the tenant)'
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
      description: 'Short title of the application'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the application'
    },
    applicationName: {
      type: 'string',
      description: 'Identifier of the origin application'
    },
    createdBy: eventBy,
    updatedBy: eventBy,
    createdAt: {
      type: 'string',
      description: 'Creation date of this application',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this application',
      format: 'date-time'
    },
    lastConfigured: {
      type: 'string',
      description: 'Date of the last validation of a configuration for this application',
      format: 'date-time'
    },
    status: {
      type: 'string',
      enum: ['created', 'configured-draft', 'configured', 'error']
    },
    owner,
    configuration: configurationSchema,
    configurationDraft: configurationSchema,
    url: {
      type: 'string',
      deprecated: true,
      description: 'The URL the base application is located at (replaced by baseApp.url)'
    },
    urlDraft: {
      type: 'string',
      description: 'The URL the base application for the draft configuration is located at (replaced by baseAppDraft.url)'
    },
    baseApp: baseAppReference,
    baseAppDraft: baseAppReference,
    errorMessage: {
      type: 'string'
    },
    errorMessageDraft: {
      type: 'string'
    },
    publications: {
      type: 'array',
      description: 'References to all the catalogs the application metadata is published too',
      items: publicationSchema
    },
    publicationSites: {
      type: 'array',
      description: 'References to all sites the application is exposed in.',
      items: {
        type: 'string'
      }
    },
    requestedPublicationSites: {
      type: 'array',
      description: 'References to all sites the application would be exposed in if validated by an admin.',
      items: {
        type: 'string'
      }
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair'
    },
    preferLargeDisplay: {
      type: 'boolean',
      default: false
    },
    permissions
  }
}
