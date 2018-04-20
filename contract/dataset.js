const owner = require('./owner')
const eventBy = require('./event-by')

module.exports = {
  'title': 'Dataset',
  'type': 'object',
  'additionalProperties': false,
  'required': ['id', 'owner', 'file'],
  'properties': {
    'id': {
      'type': 'string',
      'description': 'Identifier of the dataset'
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
        'schema': {
          'type': 'array',
          'description': 'JSON schema of the fields in the file'
        },
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
      'enum': ['loaded', 'analyzed', 'schematized', 'indexed', 'extended', 'finalized', 'error'],
      'description': 'The processing steps of a dataset.'
    },
    'schema': {
      'type': 'array',
      'description': 'JSON schema of the dataset'
    },
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
    }
  }
}
