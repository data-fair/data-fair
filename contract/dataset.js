const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const publicationSchema = JSON.parse(JSON.stringify(require('./publication')))
publicationSchema.properties.addToDataset = {
  type: 'object',
  description: 'Fill this object to create a new resource (or community resource) to an existing dataset. If empty a new dataset will be created.',
  properties: {
    id: {
      type: 'string'
    },
    title: {
      type: 'string'
    }
  }
}

const schema = {
  'type': 'array',
  'description': 'JSON schema properties of the fields in the file',
  items: {
    type: 'object',
    required: ['key', 'type'],
    properties: {
      key: { type: 'string' },
      type: { type: 'string' },
      format: { type: 'string' },
      'x-originalName': { type: 'string' },
      'x-refersTo': { type: 'string' }
    }
  }
}

module.exports = {
  'title': 'Dataset',
  'type': 'object',
  'additionalProperties': false,
  'required': ['file'],
  'properties': {
    'id': {
      'type': 'string',
      'description': 'Identifier of the dataset'
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
      'description': 'Short title of the dataset'
    },
    'description': {
      'type': 'string',
      'description': 'Detailed description of the dataset'
    },
    'file': {
      'type': 'object',
      'additionalProperties': false,
      'required': ['name', 'size', 'encoding', 'mimetype'],
      'properties': {
        'name': {
          'type': 'string',
          'description': 'Name of the file that was used to create or update this dataset'
        },
        'size': {
          'type': 'number',
          'description': 'Size of the file on disk'
        },
        'encoding': {
          'type': 'string',
          'description': 'Encoding of the file'
        },
        'mimetype': {
          'type': 'string',
          'enum': ['text/csv'],
          'description': 'Mime type of the file'
        },
        schema,
        'props': {
          'type': 'object',
          'additionalProperties': false,
          'properties': {
            'numLines': {
              'type': 'number',
              'description': 'Number of lines this file has.'
            },
            'linesDelimiter': {
              'type': 'string',
              'description': 'New line character or characters (can be \r\n))'
            },
            'fieldsDelimiter': {
              'type': 'string',
              'description': 'Fields delimiter'
            },
            'escapeChar': {
              'type': 'string',
              'description': 'Character used to escape string'
            }
          }
        }
      }
    },
    'originalFile': {
      'type': 'object',
      'additionalProperties': false,
      'required': ['name', 'size', 'mimetype'],
      'properties': {
        'name': {
          'type': 'string',
          'description': 'Name of the file that was used to create or update this dataset'
        },
        'size': {
          'type': 'number',
          'description': 'Size of the file on disk'
        },
        'mimetype': {
          'type': 'string',
          'enum': ['text/csv'],
          'description': 'Mime type of the file'
        }
      }
    },
    'remoteFile': {
      'type': 'object',
      'additionalProperties': true, // for properties such as catalogId or resourceId that are specific to kind of remote resources
      'required': ['url'],
      'properties': {
        'name': {
          'type': 'string',
          'description': 'Name of the remote file that was used to create or update this dataset'
        },
        'url': {
          'type': 'string',
          'description': 'Url from where the file can be fetched'
        },
        catalog: {
          'type': 'string',
          'description': `Identifiant du catalogue d'origine`
        },
        'size': {
          'type': 'number',
          'description': 'Size of the file on disk'
        },
        'mimetype': {
          'type': 'string',
          'enum': ['text/csv'],
          'description': 'Mime type of the file'
        }
      }
    },
    'createdBy': eventBy,
    'updatedBy': eventBy,
    'createdAt': {
      'type': 'string',
      'description': 'Creation date of this dataset',
      'format': 'date-time'
    },
    'updatedAt': {
      'type': 'string',
      'description': 'Date of the last update for this dataset',
      'format': 'date-time'
    },
    'finalizedAt': {
      'type': 'string',
      'description': 'Date of the last finalization for this dataset',
      'format': 'date-time'
    },
    owner,
    'status': {
      'type': 'string',
      'enum': ['remote', 'uploaded', 'loaded', 'analyzed', 'schematized', 'indexed', 'extended', 'finalized', 'error'],
      'description': 'The processing steps of a dataset.'
    },
    schema,
    'count': {
      'type': 'number',
      'description': 'The number of indexed documents of a dataset'
    },
    'bbox': {
      'type': 'array',
      'description': 'The spatial coverage of this dataset, in bounding box format.',
      'items': {
        'type': 'number'
      }
    },
    'license': {
      'type': 'object',
      'additionalProperties': false,
      'required': ['title', 'href'],
      'properties': {
        'title': {
          'type': 'string',
          'description': 'Short title for the license'
        },
        'href': {
          'type': 'string',
          'description': 'The URL where the license can be read'
        }
      }
    },
    'origin': {
      'type': 'string',
      'description': 'The URL where the original data can be found'
    },
    'extensions': {
      'type': 'array',
      'description': 'Définition des enrichissements appliqués à ce jeu de données',
      'items': {
        'type': 'object',
        'properties': {
          'active': {
            'type': 'boolean',
            'description': 'Toggle on and off the extension'
          },
          'forceNext': {
            'type': 'boolean',
            'description': 'Set to true to force overwriting extension results on next indexing.'
          },
          'progress': {
            'type': 'number',
            'description': 'From 0 to 1 based on progress of the extension.'
          },
          'error': {
            'type': 'string',
            'description': 'An error that occured during the last time the extension was run'
          },
          'remoteService': {
            'type': 'string',
            'description': "L'identifiant du service distant utilisé pour l'enrichissement"
          },
          'action': {
            'type': 'string',
            'description': "L'identifiant de l'action du service distant à utiliser pour l'enrichissement"
          },
          'select': {
            'type': 'array',
            'description': 'La liste des champs à sélectionner dans le retour du service distant. Tous les champs si absent ou vide.',
            'items': {
              'type': 'string'
            }
          }
        }
      }
    },
    publications: {
      type: 'array',
      description: 'References to all the catalogs the dataset metadata is published too',
      items: publicationSchema
    },
    hasFiles: {
      type: 'boolean',
      default: false,
      description: 'true when the dataset has attached files'
    },
    isVirtual: {
      type: 'boolean',
      default: false,
      description: 'Used to identify virtual datasets. A virtual datasets does not have data, only references to other datasets.'
    },
    virtual: {
      type: 'object',
      description: 'A configuration object dedicated to virtual datasets.',
      properties: {
        children: {
          type: 'array',
          description: 'Array of ids of the children datasets',
          items: {
            type: 'string'
          }
        }
      }
    },
    permissions
  }
}
