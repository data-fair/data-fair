const config = require('config')
const prettyBytes = require('pretty-bytes')
const datasetSchema = require('./dataset')
const version = require('../package.json').version
const masterData = require('./master-data')
const datasetUtils = require('../server/utils/dataset')
const utils = require('./utils')

const apiRate = (key, label) => {
  return `Un utilisateur ${label} ne peut pas effectuer plus de ${config.defaultLimits.apiRate[key].nb} requêtes par interval de ${config.defaultLimits.apiRate[key].duration} seconde${config.defaultLimits.apiRate[key].duration > 1 ? 's' : ''}.
  Sa vitesse de téléchargement totale sera limitée à ${prettyBytes(config.defaultLimits.apiRate[key].bandwidth.static)}/s pour les contenus statiques (fichiers de données, pièces jointes, etc.) et à ${prettyBytes(config.defaultLimits.apiRate[key].bandwidth.dynamic)}/s pour les autres appels.`
}
const userApiRate = apiRate('user', 'authentifié (session ou clé d\'API)')
const anonymousApiRate = apiRate('anonymous', 'anonyme')

module.exports = (dataset, publicUrl = config.publicUrl) => {
  dataset.schema = dataset.schema || []
  const datasetLineSchema = datasetUtils.jsonSchema(dataset.schema, publicUrl, true)

  const properties = dataset.schema
  const stringProperties = properties
    .filter(p => !p['x-calculated'] && p.type === 'string' && (!p.format || p.format === 'uri-reference'))
  const textSearchProperties = stringProperties
    .filter(p => !p['x-capabilities'] || p['x-capabilities'].text !== false || p['x-capabilities'].textStandard !== false)
  const textAggProperties = stringProperties
    .filter(p => !p['x-capabilities'] || p['x-capabilities'].textAgg !== false)
  const stringValuesProperties = dataset.schema
    .filter(p => !p['x-capabilities'] || p['x-capabilities'].index !== false)
  const numberProperties = dataset.schema
    .filter(p => p.type === 'number')

  const filterParams = [{
    in: 'query',
    name: 'q',
    description: `
  Colonne de recherche simple. Ce paramètre peut-être utilisé pour exposer une fonctionalité de recherche textuelle riche aux utilisateurs sans risque de créer des erreurs de syntaxe.

  Exemple: "open data" | "open source"

  Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html) correspondante.
    `,
    schema: {
      type: 'string',
    },
  }, {
    in: 'query',
    name: 'q_mode',
    description: `
  Ce paramètre permet d'altérer le comportement du paramètre "q".

  Le mode par défaut "simple" expose directement la fonctionnalité [simple-query-string de Elasticsearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html)

  Le mode "complete" permet d'enrichir automatiquement la requête soumise par l'utilisateur pour un résultat intuitif dans le contexte d'un champ de type autocomplete. Attention ce mode est potentiellement moins performant et à limiter à des jeux de données au volume raisonnable.
    `,
    schema: {
      type: 'string',
      default: 'simple',
      enum: ['simple', 'complete'],
    },
  }, {
    in: 'query',
    name: 'qs',
    description: `
Colonne de filtre et recherche textuelle avancée. Ce paramètre permet d'effectuer des requêtes complexes sur la source de données. Vous pouvez spécifier des filtres par colonne, créer des combinaisons logiques à volonté, etc.

Exemple: ma_colonne:"du texte" AND ma_colonne2:valeur

Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html) correspondante.
  `,
    schema: {
      type: 'string',
    },
  }]
  if (dataset.bbox && dataset.bbox.length === 4) {
    filterParams.push({
      in: 'query',
      name: 'bbox',
      description: "Un filtre pour restreindre les résultats à une zone géographique. Le format est 'gauche,bas,droite,haut' autrement dit 'lonMin,latMin,lonMax,latMax'.",
      schema: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      style: 'commaDelimited',
    })
    filterParams.push({
      in: 'query',
      name: 'xyz',
      description: `
  Un filtre pour restreindre les résultats à une zone géographique avec les paramètres standards de tuiles géographiques x,y et z.

  Le format est 'x,y,z'.
    `,
      schema: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      style: 'commaDelimited',
    })
    filterParams.push({
      in: 'query',
      name: 'geo_distance',
      description: `
  Un filtre pour restreindre les résultats à moins d'une certaine distance du point passé en paramètre.

  Le format est 'lon,lat,distance'. La distance optionnelle (0 par défaut) et est exprimée en mètres.

  Si les documents contiennent des géométries la distance est calculée à partir de leurs centroïdes à moins que la distance soit 0 auquel cas le filtre retourner tous les documents dont la géométrie contient le point passé en paramètre.
    `,
      schema: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      style: 'commaDelimited',
    })
  }

  const hitsParams = [{
    in: 'query',
    name: 'sort',
    description: `
Le tri à effectuer sous forme d'une liste de clés de colonnes séparées par des virgules.

Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple: ma_colonne,-ma_colonne2`,
    schema: {
      type: 'array',
      default: [],
      items: {
        type: 'string',
        enum: stringValuesProperties.map(p => p.key),
      },
    },
    style: 'commaDelimited',
  }, {
    in: 'query',
    name: 'size',
    description: 'Le nombre de résultats à retourner (taille de la pagination). 20 par défaut.',
    schema: {
      default: 20,
      type: 'integer',
      maximum: 10000,
    },
  }, {
    in: 'query',
    name: 'select',
    description: 'La liste des colonnes à retourner',
    schema: {
      default: ['*'],
      type: 'array',
      items: {
        type: 'string',
        enum: properties.map(p => p.key),
      },
    },
    style: 'commaDelimited',
  }, {
    in: 'query',
    name: 'thumbnail',
    description: `
Demande à retourner un lien de vignette d'une dimension déterminée à partir d'une colonne image.

Pour que ce paramètre soit accepté le concept "Image" doit être associé à une colonne du jeu de données.

La valeur du paramètre est la dimension passée sous la form largeurxhauteur (300x200 par exemple) où un 0 sur la largeur ou la hauteur signifie que l'autre valeur est prise en compte et les proportions conservées.
    `,
    schema: {
      type: 'string',
    },
  }, {
    in: 'query',
    name: 'highlight',
    description: `
Demande à retourner des extraits du document qui contiennent les mots utilisés en filtre (paramètres q et qs).

La valeur est une liste de colonnes séparées par des virgules.
    `,
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: textSearchProperties.map(p => p.key),
      },
    },
    style: 'commaDelimited',
  }, {
    in: 'query',
    name: 'sampling',
    description: `
**Uniquement avec le paramètre de tuilage xyz**. Configure le mode d'échantillonage des resultats pour privilégier soit l'exhaustivité des données soit une densité plus homogène sur la carte.

  - **neighbors** (défaut) : utilise la densité maximale parmi les tuiles voisines pour réduire la densité de la tuile courante au même niveau d'échantillonage (couteux en performance).
  - **max** : retourne le maximum (limité par le paramètre size) de résultat pour chaque tuile.
    `,
    schema: {
      type: 'string',
      enum: ['neighbors', 'max'],
      default: 'neighbors',
    },
  }]

  const aggSizeParam = {
    in: 'query',
    name: 'agg_size',
    description: 'Le nombre de buckets pour l\'agrégation (défaut 20)',
    schema: {
      default: 20,
      type: 'integer',
      maximum: 10000,
    },
  }

  const metricParam = {
    in: 'query',
    name: 'metric',
    description: 'La métrique à appliquer',
    schema: {
      type: 'string',
      enum: ['avg', 'sum', 'min', 'max'],
    },
  }

  const metricFieldParam = {
    in: 'query',
    name: 'metric_field',
    description: 'La colonne sur lequel effectuer la calcul de métrique',
    schema: {
      type: 'string',
    },
  }
  if (numberProperties.length) {
    metricFieldParam.schema.enum = numberProperties.map(p => p.key)
  }

  const formatParam = {
    in: 'query',
    name: 'format',
    description: 'Le format de la donnée. json par défaut, pbf pour tuiles vectorielles, geojson et wkt pour formats géographiques.',
    schema: {
      default: 'json',
      enum: ['json'].concat(dataset.bbox && dataset.bbox.length === 4 ? ['pbf', 'geojson', 'wkt'] : []),
    },
  }

  let description = `
Cette documentation interactive à destination des développeurs permet de consommer les ressources du jeu de données "${dataset.title || dataset.id}".
`

  description += `
Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :

- ${anonymousApiRate}
- ${userApiRate}
  `

  const servers = [{
    url: `${publicUrl}/api/v1/datasets/${dataset.id}`,
    description: `Jeu de données Data Fair - ${new URL(publicUrl).hostname} - ${dataset.title}`,
  }]

  const api = {
    openapi: '3.0.0',
    info: {
      title: `API publique du jeu de données : ${dataset.title || dataset.id}`,
      description,
      version,
      'x-api-id': `${new URL(publicUrl).hostname.replace(/\./g, '-')}-dataset-${dataset.id}`,
      ...config.info,
    },
    components: {
      securitySchemes: {},
      schemas: { datasetSchema },
    },
    security: [],
    servers,
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations du jeu de données.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' },
                },
              },
            },
          },
        },
      },
      '/data-files': {
        get: {
          summary: 'Récupérer la liste des fichiers de données.',
          operationId: 'readDataFiles',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le résultat de la requête.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    description: 'Le tableau de résultats.',
                    items: {
                      type: 'object',
                      properties: {
                        key: {
                          type: 'string',
                        },
                        size: {
                          type: 'number',
                        },
                        name: {
                          type: 'string',
                        },
                        mimetype: {
                          type: 'string',
                        },
                        updatedAt: {
                          type: 'string',
                          format: 'date-time',
                        },
                        title: {
                          type: 'string',
                        },
                        url: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
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
            schema: {
              default: 1,
              type: 'integer',
            },
          }, formatParam].concat(filterParams).concat(hitsParams).concat([{
            in: 'query',
            name: 'collapse',
            description: 'Afficher une ligne de résultat par valeur distince d\'un champ',
            schema: {
              type: 'string',
              enum: stringValuesProperties.map(p => p.key),
            },
          }]),
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
                        description: 'Le nombre total de résultat si on ignore la pagination',
                      },
                      results: {
                        type: 'array',
                        description: 'Le tableau de résultats.',
                        items: datasetLineSchema,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/values_agg': {
        get: {
          summary: 'Récupérer des informations agrégées en fonction des valeurs d\'une colonne.',
          operationId: 'getValuesAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'La colonne en fonction des valeurs desquelles grouper les lignes du jeu de données',
            schema: {
              type: 'string',
              enum: stringValuesProperties.map(p => p.key),
            },
          }, formatParam, metricParam, metricFieldParam, aggSizeParam].concat(filterParams).concat(hitsParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'une colonne.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/values/{field}': {
        get: {
          summary: 'Récupérer la liste des valeurs distinctes d\'une colonne éventuellement filtrée par le paramètre q.',
          operationId: 'getValues',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'path',
            name: 'field',
            description: 'La colonne de laquelle lister les valeurs',
            required: true,
            schema: {
              type: 'string',
              enum: stringValuesProperties.map(p => p.key),
            },
          }].concat(filterParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'une colonne.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                  },
                },
              },
            },
          },
        },
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
            aggSizeParam,
          ].concat(filterParams),
          responses: {
            200: {
              description: 'Le résultat du calcul.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
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
            description: 'La colonne sur lequel effectuer l\'analyse',
            required: true,
            schema: {
              type: 'string',
              enum: textAggProperties.map(p => p.key),
            },
          }, {
            in: 'query',
            name: 'analysis',
            description: 'Le type d\'analyse textuelle effectuée sur la colonne. L\'analyse "lang" est intelligente en fonction de la langue, elle calcule la racine grammaticale des mots et ignore les mots les moins significatifs. L\'analyse "standard" effectue un travail plus basique d\'extraction de mots bruts depuis le texte.',
            schema: {
              type: 'string',
              default: 'lang',
              enum: ['lang', 'standard'],
            },
          }].concat(filterParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Le résultat de l\'analyse.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
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
                    type: 'string',
                  },
                },
              },
            },
          },
        },
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
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
      '/schema': {
        get: {
          summary: 'Récupérer la liste des colonnes filtrable',
          operationId: 'readSchema',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          parameters: [
            utils.filterParam('type', 'Filtre sur le type de colonne', ['string', 'boolean', 'integer', 'number']),
            utils.filterParam('format', 'Filtre sur de format d\'une colonne de type chaine de caractère', ['uri-reference', 'date', 'date-time']),
            {
              in: 'query',
              name: 'enum',
              description: 'Restreindre aux colonnes ayant une énumération de valeurs (moins de 50 valeurs distinctes)',
              schema: {
                type: 'boolean',
              },
            },
          ],
          responses: {
            200: {
              description: 'La liste des colonnes.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api-docs.json': {
        get: {
          summary: 'Accéder à la documentation publique de l\'API',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'La documentation publique de l\'API',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      ...masterData.endpoints(dataset),
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io',
    },
  }

  if (dataset.isVirtual || dataset.isRest || dataset.isMetaOnly) {
    delete api.paths['/raw']
    delete api.paths['/full']
    delete api.paths['/data-files']
  }

  if (dataset.isMetaOnly) {
    delete api.paths['/lines']
    delete api.paths['/schema']
    delete api.paths['/words_agg']
    delete api.paths['/metric_agg']
    delete api.paths['/values/{field}']
    delete api.paths['/values_agg']
  }

  if (textAggProperties.length === 0) {
    delete api.paths['/words_agg']
  }
  if (stringValuesProperties.length === 0) {
    delete api.paths['/values_agg']
    delete api.paths['/values/{field}']
  }

  if (dataset.bbox && dataset.bbox.length === 4) {
    api.paths['/geo_agg'] = {
      get: {
        summary: 'Récupérer des informations agrégées spatialement sur le jeu de données.',
        operationId: 'getGeoAgg',
        'x-permissionClass': 'read',
        tags: ['Données'],
        parameters: [aggSizeParam].concat(filterParams).concat(hitsParams).concat([formatParam]),
        responses: {
          200: {
            description: 'Les informations du jeu de données agrégées spatialement.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    }
  }
  return { api, userApiRate, anonymousApiRate }
}
