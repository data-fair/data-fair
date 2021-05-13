const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const topic = require('./topic')
const masterData = require('./master-data')

const publicationSchema = JSON.parse(JSON.stringify(require('./publication')))
publicationSchema.properties.addToDataset = {
  type: 'object',
  description: 'Fill this object to create a new resource (or community resource) to an existing dataset. If empty a new dataset will be created.',
  properties: {
    id: {
      type: 'string',
    },
    title: {
      type: 'string',
    },
  },
}

const schema = {
  type: 'array',
  description: 'JSON schema properties of the fields',
  items: {
    type: 'object',
    required: ['key'],
    properties: {
      key: { type: 'string', readOnly: true, 'x-display': 'hidden' },
      type: { type: 'string' },
      format: { type: ['string', 'null'] },
      'x-originalName': { type: ['string', 'null'] },
      'x-refersTo': { type: ['string', 'null'] },
      'x-calculated': { type: 'boolean' },
    },
  },
}

const fileSchema = {
  type: 'array',
  description: 'JSON schema properties of the fields in the file',
  items: {
    type: 'object',
    required: ['key'],
    properties: {
      ...schema.properties,
      ignoreDetection: { type: 'boolean', default: false },
      separator: { type: ['string', 'null'] },
      dateFormat: { type: ['string', 'null'] },
      dateTimeFormat: { type: ['string', 'null'] },
    },
  },
}

module.exports = {
  title: 'Dataset',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the dataset',
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
      description: 'Short title of the dataset',
    },
    description: {
      type: 'string',
      description: 'Detailed description of the dataset',
    },
    file: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'size', 'encoding', 'mimetype'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the file that was used to create or update this dataset',
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk',
        },
        encoding: {
          type: 'string',
          description: 'Encoding of the file',
        },
        mimetype: {
          type: 'string',
          enum: ['text/csv'],
          description: 'Mime type of the file',
        },
        schema: fileSchema,
        props: {
          type: 'object',
          additionalProperties: false,
          properties: {
            numLines: {
              type: 'number',
              description: 'Number of lines this file has.',
            },
            linesDelimiter: {
              type: 'string',
              description: 'New line character or characters (can be \r\n))',
            },
            fieldsDelimiter: {
              type: 'string',
              description: 'Fields delimiter',
            },
            escapeChar: {
              type: 'string',
              description: 'Character used to escape string',
            },
          },
        },
      },
    },
    originalFile: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'size', 'mimetype'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the file that was used to create or update this dataset',
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk',
        },
        mimetype: {
          type: 'string',
          enum: ['text/csv'],
          description: 'Mime type of the file',
        },
      },
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Name of the file that was used to create or update this attachment',
          },
          title: {
            type: 'string',
            description: 'Short title of the attachment',
          },
          description: {
            type: 'string',
            description: 'Short description of this attachment',
          },
          size: {
            type: 'number',
            description: 'Size of the file on disk',
          },
          mimetype: {
            type: 'string',
            description: 'Mime type of the file',
          },
          updatedAt: {
            type: 'string',
            description: 'Date of the last update for this attachment',
            format: 'date-time',
          },
        },
      },
    },
    remoteFile: {
      type: 'object',
      additionalProperties: true, // for properties such as catalogId or resourceId that are specific to kind of remote resources
      required: ['url'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the remote file that was used to create or update this dataset',
        },
        url: {
          type: 'string',
          description: 'Url from where the file can be fetched',
        },
        catalog: {
          type: 'string',
          description: 'Identifiant du catalogue d\'origine',
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk',
        },
        mimetype: {
          type: 'string',
          enum: ['text/csv'],
          description: 'Mime type of the file',
        },
      },
    },
    storage: {
      type: 'object',
      description: 'All storage space info of this dataset',
      properties: {
        fileSize: { type: 'integer' },
        attachmentsSize: { type: 'integer' },
        collectionSize: { type: 'integer' },
        revisionSize: { type: 'integer' },
      },
    },
    createdBy: eventBy,
    updatedBy: eventBy,
    createdAt: {
      type: 'string',
      description: 'Creation date of this dataset',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      description: 'Date of the last update for this dataset',
      format: 'date-time',
    },
    finalizedAt: {
      type: 'string',
      description: 'Date of the last finalization for this dataset',
      format: 'date-time',
    },
    owner,
    status: {
      type: 'string',
      enum: ['remote', 'uploaded', 'loaded', 'analyzed', 'schematized', 'indexed', 'extended', 'finalized', 'error'],
      description: 'The processing steps of a dataset.',
    },
    primaryKey: {
      type: 'array',
      description: 'List of properties of the schema used as unique primary key for each line',
      items: {
        type: 'string',
      },
    },
    schema,
    count: {
      type: 'number',
      description: 'The number of indexed documents of a dataset',
    },
    bbox: {
      type: 'array',
      description: 'The spatial coverage of this dataset, in bounding box format.',
      items: {
        type: 'number',
      },
    },
    timePeriod: {
      type: 'object',
      description: 'The temporal coverage of this dataset',
      properties: {
        startDate: {
          type: 'string',
          format: 'date-time',
        },
        endDate: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    timeZone: {
      type: 'string',
      description: 'The original time zone of the calendar.',
    },
    projection: {
      type: 'object',
      description: 'The cartographic projection of this dataset. Refers to the list of supported projections in contract/projections.json',
      properties: {
        title: {
          type: 'string',
        },
        code: {
          type: 'string',
        },
      },
    },
    license: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'href'],
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the license',
        },
        href: {
          type: 'string',
          description: 'The URL where the license can be read',
        },
      },
    },
    origin: {
      type: 'string',
      description: 'The URL where the original data can be found',
    },
    extensions: {
      type: 'array',
      description: 'Définition des enrichissements appliqués à ce jeu de données',
      items: {
        type: 'object',
        properties: {
          active: {
            type: 'boolean',
            description: 'Toggle on and off the extension',
          },
          remoteService: {
            type: 'string',
            description: "L'identifiant du service distant utilisé pour l'enrichissement",
          },
          action: {
            type: 'string',
            description: "L'identifiant de l'action du service distant à utiliser pour l'enrichissement",
          },
          select: {
            type: 'array',
            description: 'La liste des colonnes à sélectionner dans le retour du service distant. Toutes les colonnes si absent ou vide.',
            items: {
              type: 'string',
            },
          },
        },
      },
    },
    masterData: masterData.schema,
    publications: {
      type: 'array',
      description: 'References to all the catalogs the dataset metadata is published too',
      items: publicationSchema,
    },
    publicationSites: {
      type: 'array',
      description: 'References to all sites the dataset is exposed in.',
      items: {
        type: 'string',
      },
    },
    hasFiles: {
      type: 'boolean',
      default: false,
      description: 'true when the dataset has attached files',
    },
    attachmentsAsImage: {
      type: 'boolean',
      default: false,
      description: 'Set to true to use attached files as illustrations of the line',
    },
    isVirtual: {
      type: 'boolean',
      default: false,
      description: 'Used to identify virtual datasets. A virtual datasets does not have data, only references to other datasets.',
    },
    virtual: {
      type: 'object',
      description: 'A configuration object dedicated to virtual datasets.',
      required: ['children'],
      properties: {
        children: {
          type: 'array',
          description: 'Array of ids of the children datasets',
          items: {
            type: 'string',
          },
        },
        filters: {
          type: 'array',
          description: 'Array of static filters to always apply when querying the dataset',
          items: {
            type: 'object',
            required: ['key', 'values'],
            properties: {
              key: {
                type: 'string',
                description: 'Key of the field in the schema',
              },
              values: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
    isRest: {
      type: 'boolean',
      default: false,
      description: 'Used to identify REST datasets. A REST dataset is not created from a data file, but instead is based on a dynamic collection in a database.',
    },
    rest: {
      type: 'object',
      description: 'A configuration object dedicated to REST datasets.',
      properties: {
        history: {
          type: 'boolean',
          default: false,
          description: 'Set to true to let data-fair store revisions of the lines in the dataset.',
        },
        ttl: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
            prop: { type: 'string' },
            checkedAt: { type: 'string', format: 'date-time', readOnly: true },
            delay: {
              type: 'object',
              properties: {
                value: { type: 'integer', default: 0 },
                unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'months'], default: 'days' },
              },
            },
          },
        },
      },
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic,
    },
    thumbnails: {
      type: 'object',
      properties: {
        resizeMode: {
          type: 'string',
          description: 'Define how the thumbnails will be adapted to the size requested by visualizations',
          enum: ['crop', 'smartCrop', 'fitIn'],
          default: 'crop',
        },
      },
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair',
    },
    permissions,
    previews: {
      type: 'array',
      title: 'Prévisualisations',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          href: { type: 'string' },
        },
      },
    },
  },
}
