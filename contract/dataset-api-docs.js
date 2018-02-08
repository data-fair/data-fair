const config = require('config')
const datasetSchema = require('./dataset.json')
const version = require('../package.json').version

module.exports = (dataset) => {
  dataset.schema = dataset.schema || []
  const properties = dataset.schema.map(p => p.key)
  const nonTextProperties = dataset.schema.filter(p => p.type !== 'string' || p.format).map(p => p.key)
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
        enum: nonTextProperties
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
    servers: [{
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations du jeu de données.',
          operationId: 'readDescription',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: datasetSchema
                }
              }
            }
          }
        },
        patch: {
          summary: 'Mettre à jour les informations du jeu de données.',
          operationId: 'writeDescription',
          tags: ['Métadonnées'],
          requestBody: {
            description: 'Fichier à charger et informations de propriété',
            required: true,
            content: {
              'application/json': {
                schema: datasetSchema
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: datasetSchema
                }
              }
            }
          }
        }
      },
      '/lines': {
        get: {
          summary: 'Requêter les lignes du jeu de données.',
          operationId: 'readLines',
          tags: ['Données'],
          parameters: [{ in: 'query',
            name: 'page',
            description: 'Le numéro de la page (indice de la pagination). Débute à 1.',
            required: false,
            schema: {
              default: 1,
              type: 'integer'
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
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'Le champ en fonction des valeurs duquel grouper les lignes du jeu de donénes',
            required: true,
            schema: {
              type: 'string',
              enum: nonTextProperties
            }
          }, metricParam, metricFieldParam, aggSizeParam].concat(queryParams),
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
          tags: ['Données'],
          parameters: [
            Object.assign({}, metricParam, {required: true}),
            Object.assign({}, metricFieldParam, {required: true}),
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
      }
      // values_agg: {
      //   get: {
      //     summary: '',
      //     operationId: '',
      //     tags: ['Données'],
      //     parameters: []
      //   }
      // },
      // metric_agg: {
      //
      // }
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
