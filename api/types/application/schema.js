import owner from '../../contract/owner.js'
import eventBy from '../../contract/event-by.js'
import publicationSchema from '../../contract/publication.js'

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
  $id: 'https://github.com/data-fair/data-fair/application',
  title: 'Application',
  'x-exports': ['types', 'validate', 'resolvedSchema'],
  type: 'object',
  additionalProperties: false,
  required: ['id', 'slug', 'url', 'title', 'owner'],
  properties: {
    id: {
      type: 'string',
      description: 'Globally unique identifier of the application',
      pattern: '^[a-z0-9_\\-]+$'
    },
    slug: {
      type: 'string',
      description: 'Identifier of the application, usually a slug for URL readability (unique inside the tenant)',
      pattern: '^[a-z0-9_\\-]+$'
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
    summary: {
      type: 'string',
      description: 'Short description of the application'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the application'
    },
    image: {
      type: 'string',
      description: 'URL d\'une image, illustration du jeu de données'
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
    configuration: { $ref: 'https://github.com/data-fair/data-fair/app-config' },
    configurationDraft: { $ref: 'https://github.com/data-fair/data-fair/app-config' },
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
      oneOf: [
        { type: 'string' },
        { type: 'object', properties: { message: { type: 'string' } } }
      ]
    },
    errorMessageDraft: {
      oneOf: [
        { type: 'string' },
        { type: 'object', properties: { message: { type: 'string' } } }
      ]
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
      items: {
        $ref: 'https://github.com/data-fair/data-fair/topic'
      }
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair'
    },
    preferLargeDisplay: {
      type: 'boolean',
      default: false
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'name'],
        properties: {
          title: {
            type: 'string',
            title: 'Titre',
            'x-props': { outlined: true, dense: true }
          },
          name: {
            'x-display': 'hidden',
            type: 'string',
            description: 'Name of the file that was used to create or update this attachment'
          },
          size: {
            'x-display': 'hidden',
            type: 'number',
            description: 'Size of the file on disk'
          },
          mimetype: {
            'x-display': 'hidden',
            type: 'string',
            description: 'Mime type of the file'
          },
          updatedAt: {
            'x-display': 'hidden',
            type: 'string',
            description: 'Date of the last update for this attachment',
            format: 'date-time'
          },
          url: {
            'x-display': 'hidden',
            readOnly: true,
            type: 'string',
            title: 'URL'
          }
        }
      }
    },
    permissions: { $ref: 'https://github.com/data-fair/data-fair/permissions' }
  }
}
