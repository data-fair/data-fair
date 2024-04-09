const owner = require('./owner')
const eventBy = require('./event-by')
const permissions = require('./permissions')
const topic = require('./topic')
const masterData = require('./master-data')
const capabilities = require('./capabilities')
const dataFiles = require('./data-files')
const publicationSchema = JSON.parse(JSON.stringify(require('./publication')))

publicationSchema.properties.addToDataset = {
  type: 'object',
  description: 'Fill this object to create a new resource (or community resource) to an existing dataset.',
  properties: {
    id: {
      type: 'string'
    },
    title: {
      type: 'string'
    }
  }
}

publicationSchema.properties.replaceDataset = {
  type: 'object',
  description: 'Fill this object to overwrite an existing dataset.',
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
      title: { type: 'string' },
      description: { type: 'string' },
      icon: { type: 'string' },
      'x-group': { type: 'string' },
      'x-refersTo': {
        deprecated: true,
        type: ['string', 'null']
      },
      'x-concept': {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          primary: { type: 'boolean' }
        }
      },
      'x-calculated': { type: 'boolean' },
      'x-capabilities': capabilities,
      'x-labels': {
        type: 'object'
      },
      'x-labelsRestricted': {
        type: 'boolean'
      },
      readOnly: {
        type: 'boolean'
      },
      'x-required': {
        type: 'boolean'
      },
      minLength: {
        type: 'integer'
      },
      maxLength: {
        type: 'integer'
      },
      minimum: {
        type: 'number'
      },
      maximum: {
        type: 'number'
      },
      pattern: {
        type: 'string',
        format: 'regex'
      },
      'x-master': {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          title: {
            type: 'string'
          },
          remoteService: {
            type: 'string',
            description: "L'identifiant du service distant utilisé pour l'enrichissement"
          },
          action: {
            type: 'string',
            description: "L'identifiant de l'action du service distant à utiliser pour l'enrichissement"
          }
        }
      },
      'x-display': {
        type: 'string'
      },
      enum: {
        type: 'array',
        readOnly: true,
        description: 'This differs from JSON schema. It is not a restriction, just and observation of the values that are present in the dataset.'
      },
      'x-cardinality': {
        type: 'integer',
        description: 'The number of distinct values for this field'
      }
    }
  }
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
      ignoreIntegerDetection: { type: 'boolean', default: false },
      separator: { type: ['string', 'null'] },
      dateFormat: { type: ['string', 'null'] },
      dateTimeFormat: { type: ['string', 'null'] },
      timeZone: { type: ['string', 'null'] }
    }
  }
}

module.exports = {
  title: 'Dataset',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'Globally unique identifier of the dataset'
    },
    slug: {
      type: 'string',
      description: 'Identifier of the dataset, usually a slug for URL readability (unique inside the tenant)'
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
      description: 'Short title of the dataset'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the dataset'
    },
    image: {
      type: 'string',
      description: 'URL d\'une image, illustration du jeu de données'
    },
    // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
    spatial: {
      type: 'string',
      description: 'spatial coverage'
    },
    // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_temporal
    temporal: {
      type: 'object',
      description: 'temporal coverage',
      properties: {
        start: {
          type: 'string',
          format: 'date'
        },
        end: {
          type: 'string',
          format: 'date'
        }
      }
    },
    keywords: {
      type: 'array',
      description: 'keywords',
      items: {
        type: 'string'
      }
    },
    // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_frequency and https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
    frequency: {
      type: 'string',
      description: 'update frequency',
      enum: ['', 'triennial', 'biennial', 'annual', 'semiannual', 'threeTimesAYear', 'quarterly', 'bimonthly', 'monthly', 'semimonthly', 'biweekly', 'threeTimesAMonth', 'weekly', 'semiweekly', 'threeTimesAWeek', 'daily', 'continuous', 'irregular']
    },
    file: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'size', 'encoding', 'mimetype'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the file that was used to create or update this dataset'
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk'
        },
        encoding: {
          type: 'string',
          description: 'Encoding of the file'
        },
        mimetype: {
          type: 'string',
          enum: ['text/csv'],
          description: 'Mime type of the file'
        },
        schema: fileSchema,
        props: {
          type: 'object',
          additionalProperties: false,
          properties: {
            numLines: {
              type: 'number',
              description: 'Number of lines this file has.'
            },
            linesDelimiter: {
              type: 'string',
              description: 'New line character or characters (can be \r\n))'
            },
            fieldsDelimiter: {
              type: 'string',
              description: 'Fields delimiter'
            },
            escapeChar: {
              type: 'string',
              description: 'Character used to escape string'
            }
          }
        }
      }
    },
    originalFile: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'size', 'mimetype'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the file that was used to create or update this dataset'
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk'
        },
        mimetype: {
          type: 'string',
          enum: ['text/csv'],
          description: 'Mime type of the file'
        },
        md5: {
          type: 'string',
          description: 'MD5 hash of the file content'
        }
      }
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: {
            type: 'string',
            title: 'Titre',
            'x-props': { outlined: true, dense: true }
          },
          description: {
            type: 'string',
            title: 'Description',
            'x-display': 'markdown'
          },
          includeInCatalogPublications: {
            type: 'boolean',
            title: 'Inclure dans les publications sur catalogue',
            default: false
          }
        },
        oneOf: [{
          title: 'Fichier',
          required: ['name'],
          properties: {
            type: {
              title: 'Type de pièce jointe',
              const: 'file'
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
        }, {
          title: 'Lien',
          required: ['url'],
          properties: {
            type: {
              title: 'Type de pièce jointe',
              const: 'url'
            },
            url: {
              type: 'string',
              title: 'URL'
            }
          }
        }, {
          title: 'Fichier récupéré depuis une URL',
          required: ['name'],
          properties: {
            type: {
              title: 'Type de pièce jointe',
              const: 'remoteFile'
            },
            name: {
              type: 'string',
              title: 'Nom du fichier'
            },
            targetUrl: {
              type: 'string',
              title: 'URL de téléchargement',
              description: 'Cette URL n\'est pas consultable après écriture. Elle est utilisée pour télécharger le fichier depuis un service distant et peut contenir un secret.'
            }
          }
        }]
      }
    },
    remoteFile: {
      type: 'object',
      additionalProperties: true, // for properties such as catalogId or resourceId that are specific to kind of remote resources
      required: ['url'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the remote file that was used to create or update this dataset'
        },
        url: {
          type: 'string',
          description: 'Url from where the file can be fetched'
        },
        catalog: {
          type: 'string',
          description: 'Identifiant du catalogue d\'origine'
        },
        size: {
          type: 'number',
          description: 'Size of the file on disk'
        },
        mimetype: {
          type: 'string',
          description: 'Mime type of the file'
        },
        etag: {
          type: 'string',
          description: 'content of the "etag" response header if it was provided'
        },
        lastModified: {
          type: 'string',
          description: 'content of the "last-modified" response header if it was provided'
        },
        autoUpdate: {
          type: 'object',
          properties: {
            active: { type: 'boolean', default: false },
            nextUpdate: { type: 'string', format: 'date-time' },
            lastUpdate: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    storage: {
      type: 'object',
      description: 'All storage space info of this dataset',
      properties: {
        size: { type: 'integer' },
        indexed: {
          type: 'object',
          properties: {
            size: { type: 'integer' },
            parts: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['collection', 'original-file', 'normalized-file', 'full-file', 'attachments', 'master-data']
              }
            }
          }
        },
        attachments: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            size: { type: 'integer' }
          }
        },
        metadataAttachments: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            size: { type: 'integer' }
          }
        },
        collection: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            size: { type: 'integer' }
          }
        },
        revisions: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            size: { type: 'integer' }
          }
        },
        masterData: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            size: { type: 'integer' }
          }
        },
        dataFiles
      }
    },
    createdAt: {
      type: 'string',
      description: 'Creation date of this dataset',
      format: 'date-time'
    },
    createdBy: eventBy,
    updatedAt: {
      type: 'string',
      description: 'Date of the last metadata update for this dataset',
      format: 'date-time'
    },
    updatedBy: eventBy,
    dataUpdatedAt: {
      type: 'string',
      description: 'Date of the last update for this dataset',
      format: 'date-time'
    },
    dataUpdatedBy: eventBy,
    finalizedAt: {
      type: 'string',
      description: 'Date of the last finalization for this dataset',
      format: 'date-time'
    },
    owner,
    status: {
      type: 'string',
      enum: ['remote', 'uploaded', 'loaded', 'analyzed', 'schematized', 'indexed', 'extended', 'finalized', 'error'],
      description: 'The processing steps of a dataset.'
    },
    primaryKey: {
      type: 'array',
      description: 'List of properties of the schema used as unique primary key for each line',
      items: {
        type: 'string'
      }
    },
    schema,
    count: {
      type: 'number',
      description: 'The number of indexed documents of a dataset'
    },
    bbox: {
      type: 'array',
      description: 'The spatial coverage of this dataset, in bounding box format.',
      items: {
        type: 'number'
      }
    },
    timePeriod: {
      type: 'object',
      description: 'The temporal coverage of this dataset',
      properties: {
        startDate: {
          type: 'string',
          format: 'date-time'
        },
        endDate: {
          type: 'string',
          format: 'date-time'
        }
      }
    },
    timeZone: {
      type: 'string',
      description: 'The original time zone of the calendar.'
    },
    projection: {
      type: 'object',
      description: 'The cartographic projection of this dataset. Refers to the list of supported projections in contract/projections.json',
      properties: {
        title: {
          type: 'string'
        },
        code: {
          type: 'string'
        }
      }
    },
    license: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'href'],
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the license'
        },
        href: {
          type: 'string',
          description: 'The URL where the license can be read'
        }
      }
    },
    origin: {
      type: 'string',
      description: 'The URL where the original data can be found'
    },
    extensions: {
      type: 'array',
      description: 'Définition des enrichissements appliqués à ce jeu de données',
      items: {
        type: 'object',
        properties: {
          active: {
            type: 'boolean',
            description: 'Toggle on and off the extension'
          }
        },
        oneOf: [{
          required: ['type', 'expr', 'property'],
          properties: {
            type: {
              type: 'string',
              const: 'exprEval'
            },
            expr: {
              type: 'string'
            },
            property: {
              type: 'object',
              required: ['key', 'type'],
              properties: {
                key: {
                  type: 'string'
                },
                type: {
                  type: 'string'
                }
              }
            }
          }
        }, {
          required: ['type', 'remoteService', 'action'],
          properties: {
            type: {
              type: 'string',
              const: 'remoteService'
            },
            remoteService: {
              type: 'string',
              description: "L'identifiant du service distant utilisé pour l'enrichissement"
            },
            action: {
              type: 'string',
              description: "L'identifiant de l'action du service distant à utiliser pour l'enrichissement"
            },
            select: {
              type: 'array',
              description: 'La liste des colonnes à sélectionner dans le retour du service distant. Toutes les colonnes si absent ou vide.',
              items: {
                type: 'string'
              }
            },
            shortId: {
              type: 'string',
              description: 'Id court (déprécié)',
              readOnly: true
            },
            propertyPrefix: {
              type: 'string',
              description: 'Chaine à utiliser comme préfixe des clés de champs issus de cette extension'
            }
          }
        }]
      }
    },
    masterData: masterData.schema,
    publications: {
      type: 'array',
      description: 'References to all the catalogs the dataset metadata is published too',
      items: publicationSchema
    },
    publicationSites: {
      type: 'array',
      description: 'References to all sites the dataset is exposed in.',
      items: {
        type: 'string'
      }
    },
    requestedPublicationSites: {
      type: 'array',
      description: 'References to all sites the dataset would be exposed in if validated by an admin.',
      items: {
        type: 'string'
      }
    },
    hasFiles: {
      type: 'boolean',
      default: false,
      description: 'true when the dataset has attached files'
    },
    attachmentsAsImage: {
      type: 'boolean',
      default: false,
      description: 'Set to true to use attached files as illustrations of the line'
    },
    isVirtual: {
      type: 'boolean',
      default: false,
      description: 'Used to identify virtual datasets. A virtual datasets does not have data, only references to other datasets.'
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
            type: 'string'
          }
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
                description: 'Key of the field in the schema'
              },
              values: {
                type: 'array',
                items: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    },
    isRest: {
      type: 'boolean',
      default: false,
      description: 'Used to identify REST datasets. A REST dataset is not created from a data file, but instead is based on a dynamic collection in a database.'
    },
    rest: {
      type: 'object',
      description: 'A configuration object dedicated to REST datasets.',
      properties: {
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
                unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'months'], default: 'days' }
              }
            }
          }
        },
        history: {
          type: 'boolean',
          default: false,
          description: 'Set to true to let data-fair store revisions of the lines in the dataset.'
        },
        historyTTL: {
          type: 'object',
          additionalProperties: false,
          properties: {
            active: { type: 'boolean' },
            delay: {
              type: 'object',
              additionalProperties: false,
              properties: {
                value: { type: 'integer', default: 0 },
                unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'months'], default: 'days' }
              }
            }
          }
        },
        lineOwnership: { type: 'boolean' },
        storeUpdatedBy: { type: 'boolean' },
        primaryKeyMode: {
          type: 'string',
          enum: ['base64', 'sha256']
        }
      }
    },
    isMetaOnly: {
      type: 'boolean',
      default: false,
      description: 'Used to identify datasets without any local data and only some metadata.'
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic
    },
    thumbnails: {
      type: 'object',
      properties: {
        resizeMode: {
          type: 'string',
          description: 'Define how the thumbnails will be adapted to the size requested by visualizations',
          enum: ['crop', 'smartCrop', 'fitIn'],
          default: 'crop'
        }
      }
    },
    exports: {
      type: 'object',
      properties: {
        restToCSV: {
          type: 'object',
          properties: {
            active: { type: 'boolean', default: false },
            nextExport: { type: 'string', format: 'date-time' },
            lastExport: {
              type: 'object',
              properties: {
                date: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    },
    extras: {
      type: 'object',
      description: 'An object for extra content from client services of data-fair'
    },
    analysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        escapeKeyAlgorithm: {
          type: 'string',
          default: 'slug',
          enum: ['legacy', 'slug']
        }
      }
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
          href: { type: 'string' }
        }
      }
    },
    readApiKey: {
      type: 'object',
      additionalProperties: false,
      properties: {
        active: { type: 'boolean', title: 'Activer l\'accès par clé d\'API' },
        interval: { type: 'string', title: 'Durée de validité des clés', oneOf: [{ const: 'P1W', title: '1 semaine' }, { const: 'P1M', title: '1 mois' }, { const: 'P1Y', title: '1 année' }] },
        expiresAt: { type: 'string', format: 'date-time', readOnly: true, 'x-display': 'hidden' },
        renewAt: { type: 'string', format: 'date-time', readOnly: true, 'x-display': 'hidden' }
      }
    }
  }
}

const draftKeys = ['schema', 'description', 'title', 'license', 'origin', 'extensions', 'publications', 'publicationSites', 'virtual', 'rest', 'extras', 'attachmentsAsImage', 'projection', 'attachments', 'topics', 'thumbnails', 'masterData', 'primaryKey', 'origin', 'image', 'spatial', 'temporal', 'keywords', 'frequency']

module.exports.properties.draft = {
  title: 'Dataset draft',
  description: 'Some properties waiting for confirmation before being merged into the main dataset info',
  type: 'object',
  additionalProperties: false,
  properties: {
    draftReason: {
      type: 'object',
      title: 'Why was the dataset switched in draft mode',
      properties: {
        key: {
          type: 'string',
          enum: ['manual', 'file-new', 'file-updated']
        },
        message: {
          type: 'string'
        },
        details: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      }
    }
  }
}
draftKeys.forEach(k => {
  module.exports.properties.draft.properties[k] = module.exports.properties[k]
})
