const config = require('config')
const datasetSchema = require('./dataset')
const datasetPatchSchema = require('./dataset-patch')
const journalSchema = require('./journal')
const version = require('../package.json').version
const permissionsDoc = require('../server/utils/permissions').apiDoc

module.exports = (dataset) => {
  dataset.schema = dataset.schema || []
  const properties = dataset.schema.map(p => p.key)
  const numberProperties = dataset.schema.filter(p => p.type === 'number').map(p => p.key)
  const queryParams = [{
    in: 'query',
    name: 'size',
    description: 'Le nombre de résultats à retourner (taille de la pagination). 20 par défaut.',
    required: false,
    schema: {
      default: 20,
      type: 'integer',
      max: 10000
    }
  }, {
    in: 'query',
    name: 'q',
    description: `
  Champ de recherche simple. Ce paramètre peut-être utilisé pour exposer une fonctionalité de recherche textuelle riche aux utilisateurs sans risque de créer des erreurs de syntaxe.

  Exemple: "open data" | "open source"

  Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html) correspondante.
    `,
    required: false,
    schema: {
      type: 'string'
    }
  }, {
    in: 'query',
    name: 'select',
    description: 'La liste des champs à retourner',
    required: false,
    schema: {
      default: ['*'],
      type: 'array',
      items: {
        type: 'string',
        enum: properties
      }
    },
    style: 'commaDelimited'
  }, {
    in: 'query',
    name: 'sort',
    description: `
  Le tri à effectuer sous forme d'une liste de clés de champs séparées par des virgules.

  Par défaut le tri est ascendant, si un nom de champ est préfixé par un "-" alors le tri sera descendant.

  Exemple: ma_colonne,-ma_colonne2`,
    required: false,
    default: [],
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: properties
      }
    },
    style: 'commaDelimited'
  }, {
    in: 'query',
    name: 'qs',
    description: `
  Champ de filtre et recherche textuelle avancé. Ce paramètre permet d'effectuer des requêtes complexes sur la source de données. Vous pouvez spécifier des filtres par champs, créer des combinaisons logiques à volonté, etc.

  Exemple: ma_colonne:"du texte" AND ma_colonne2:valeur

  Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html) correspondante.
  `,
    required: false,
    schema: {
      type: 'string'
    }
  }, {
    in: 'query',
    name: 'bbox',
    description: "Un filtre pour restreindre les résultats à une zone géographique. Le format est 'gauche,bas,droite,haut' autrement dit 'lonMin,latMin,lonMax,latMax'.",
    required: false,
    schema: {
      type: 'array',
      items: {
        type: 'number'
      }
    },
    style: 'commaDelimited'
  }, {
    in: 'query',
    name: 'xyz',
    description: `
  Un filtre pour restreindre les résultats à une zone géographique avec les paramètres standards de tuiles géographiques x,y et z.

  Le format est 'x,y,z'.
  `,
    required: false,
    schema: {
      type: 'array',
      items: {
        type: 'number'
      }
    },
    style: 'commaDelimited'
  }]

  const aggSizeParam = {
    in: 'query',
    name: 'agg_size',
    description: 'Le nombre de buckets pour l\'agrégation (défaut 20)',
    required: false,
    schema: {
      default: 20,
      type: 'integer',
      max: 10000
    }
  }

  const metricParam = {
    in: 'query',
    name: 'metric',
    description: 'La métrique à appliquer',
    required: false,
    schema: {
      type: 'string',
      enum: ['avg', 'sum', 'min', 'max']
    }
  }

  const metricFieldParam = {
    in: 'query',
    name: 'metric_field',
    description: 'Le champ sur lequel effectuer la calcul de métrique',
    required: false,
    schema: {
      type: 'string',
      enum: numberProperties
    }
  }

  const api = {
    openapi: '3.0.0',
    info: Object.assign({
      title: `API du jeu de données : ${dataset.title || dataset.id}`,
      version: version
    }, config.info),
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-apiKey'
        },
        sdCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'id_token'
        }
      },
      schemas: { datasetSchema }
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    servers: [{
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations du jeu de données.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Description'],
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Mettre à jour les informations du jeu de données.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Description'],
          requestBody: {
            description: 'Fichier à charger et informations de propriété',
            required: true,
            content: {
              'application/json': {
                schema: datasetPatchSchema
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' }
                }
              }
            }
          }
        },
        post: {
          summary: 'Mettre à jour les données du jeu de données.',
          operationId: 'writeData',
          'x-permissionClass': 'write',
          tags: ['Données'],
          requestBody: {
            description: 'Fichier à charger et autres informations',
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  ...datasetPatchSchema,
                  file: {
                    type: 'string',
                    format: 'binary'
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Métadonnées sur le dataset modifié',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer le jeu de données.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Description'],
          responses: {}
        }
      },
      '/lines': {
        get: {
          summary: 'Requêter les lignes du jeu de données.',
          operationId: 'readLines',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'page',
            description: 'Le numéro de la page (indice de la pagination). Débute à 1.',
            required: false,
            schema: {
              default: 1,
              type: 'integer'
            }
          }, {
            in: 'query',
            name: 'format',
            description: 'Le format de la donnée. json par défaut, geojson et pbf pour tuiles vectorielles.',
            required: false,
            schema: {
              default: 'json',
              enum: ['json'].concat(dataset.bbox && dataset.bbox.length === 4 ? ['pbf', 'geojson'] : [])
            }
          }].concat(queryParams),
          responses: {
            200: {
              description: 'Le résultat de la requête.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      total: {
                        type: 'integer',
                        description: 'Le nombre total de résultat si on ignore la pagination'
                      },
                      results: {
                        type: 'array',
                        description: 'Le tableau de résultats.',
                        items: {
                          type: 'object',
                          properties: dataset.schema
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/values_agg': {
        get: {
          summary: 'Récupérer des informations agrégées en fonction des valeurs d\'un champ.',
          operationId: 'getValuesAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'Le champ en fonction des valeurs duquel grouper les lignes du jeu de données',
            required: true,
            schema: {
              type: 'string',
              enum: properties
            }
          }, metricParam, metricFieldParam, aggSizeParam].concat(queryParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'un champ.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      },
      '/metric_agg': {
        get: {
          summary: 'Calculer une métrique sur un ensemble de lignes.',
          operationId: 'getMetricAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [
            Object.assign({}, metricParam, { required: true }),
            Object.assign({}, metricFieldParam, { required: true }),
            aggSizeParam
          ].concat(queryParams),
          responses: {
            200: {
              description: 'Le résultat du calcul.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      },
      '/words_agg': {
        get: {
          summary: 'Récupérer des mots significatifs dans un jeu de données.',
          operationId: 'getWordsAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: `Le champ sur lequel effectuer l'analyse`,
            required: true,
            schema: {
              type: 'string',
              enum: properties
            }
          }].concat(queryParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Le résultat de l\'analyse.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      },
      '/raw': {
        get: {
          summary: 'Télécharger le jeu de données',
          operationId: 'downloadOriginalData',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le jeu de données.',
              content: {
                'text/csv': {
                  schema: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      },
      '/full': {
        get: {
          summary: 'Télécharger le jeu de données enrichi',
          operationId: 'downloadFullData',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le jeu de données.',
              content: {
                'text/csv': {
                  schema: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      },
      '/api-docs.json': {
        get: {
          summary: 'Accéder à la documentation de l\'API',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La documentation de l\'API',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      },
      '/journal': {
        get: {
          summary: 'Accéder au journal',
          operationId: 'readJournal',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le journal.',
              content: {
                'application/json': {
                  schema: journalSchema
                }
              }
            }
          }
        }
      },
      '/_diagnose': {
        get: {
          summary: 'Récupérer des informations techniques',
          tags: ['Administration'],
          responses: {
            200: {
              content: {
                'application/json': {}
              }
            }
          }
        }
      },
      '/_reindex': {
        post: {
          summary: 'Forcer la reindexation',
          tags: ['Administration']
        }
      },
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/'
    }
  }
  if (dataset.bbox && dataset.bbox.length === 4) {
    api.paths['/geo_agg'] = {
      get: {
        summary: 'Récupérer des informations agrégées spatialement sur le jeu de données.',
        operationId: 'getGeoAgg',
        'x-permissionClass': 'read',
        tags: ['Données'],
        parameters: [aggSizeParam].concat(queryParams),
        responses: {
          200: {
            description: 'Les informations du jeu de données agrégées spatialement.',
            content: {
              'application/json': {
                schema: {
                  type: 'object'
                }
              }
            }
          }
        }
      }
    }
  }
  return api
}
