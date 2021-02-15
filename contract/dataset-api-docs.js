const config = require('config')
const prettyBytes = require('pretty-bytes')
const datasetSchema = require('./dataset')
const datasetPatchSchema = require('./dataset-patch')
const datasetPost = require('./dataset-post')
const journalSchema = require('./journal')
const version = require('../package.json').version
const permissionsDoc = require('../server/utils/permissions').apiDoc
const { visibility } = require('../server/utils/visibility')
const masterData = require('./master-data')
const utils = require('./utils')

const apiRate = (key, label) => {
  return `Un utilisateur ${label} ne peut pas effectuer plus de ${config.defaultLimits.apiRate[key].nb} requêtes par interval de ${config.defaultLimits.apiRate[key].duration} seconde${config.defaultLimits.apiRate[key].duration > 1 ? 's' : ''}.
  Sa vitesse de téléchargement totale sera limitée à ${prettyBytes(config.defaultLimits.apiRate[key].bandwidth.static)}/s pour les contenus statiques (fichiers de données, pièces jointes, etc.) et à ${prettyBytes(config.defaultLimits.apiRate[key].bandwidth.dynamic)}/s pour les autres appels.`
}
const userApiRate = apiRate('user', 'authentifié (session ou clé d\'API)')
const anonymousApiRate = apiRate('anonymous', 'anonyme')

module.exports = (dataset) => {
  dataset.schema = dataset.schema || []
  const datasetLineSchema = {
    type: 'object',
    properties: dataset.schema.reduce((a, f) => { a[f.key] = { ...f }; delete a[f.key].key; return a }, {}),
  }
  const properties = dataset.schema.map(p => p.key)
  const textProperties = dataset.schema.filter(p => p.type === 'string').map(p => p.key)
  const uriRefProperties = dataset.schema.filter(p => !p['x-calculated'] && p.type === 'string' && p.format === 'uri-reference')
  const numberProperties = dataset.schema.filter(p => p.type === 'number').map(p => p.key)
  const filterParams = [{
    in: 'query',
    name: 'q',
    description: `
  Champ de recherche simple. Ce paramètre peut-être utilisé pour exposer une fonctionalité de recherche textuelle riche aux utilisateurs sans risque de créer des erreurs de syntaxe.

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
Champ de filtre et recherche textuelle avancé. Ce paramètre permet d'effectuer des requêtes complexes sur la source de données. Vous pouvez spécifier des filtres par champs, créer des combinaisons logiques à volonté, etc.

Exemple: ma_colonne:"du texte" AND ma_colonne2:valeur

Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html) correspondante.
  `,
    schema: {
      type: 'string',
    },
  }, {
    in: 'query',
    name: 'bbox',
    description: "Un filtre pour restreindre les résultats à une zone géographique. Le format est 'gauche,bas,droite,haut' autrement dit 'lonMin,latMin,lonMax,latMax'.",
    schema: {
      type: 'array',
      items: {
        type: 'number',
      },
    },
    style: 'commaDelimited',
  }, {
    in: 'query',
    name: 'xyz',
    description: `
Un filtre pour restreindre les résultats à une zone géographique avec les paramètres standards de tuiles géographiques x,y et z.

Le format est 'x,y,z'.
  `,
    schema: {
      type: 'array',
      items: {
        type: 'number',
      },
    },
    style: 'commaDelimited',
  }]
  uriRefProperties.forEach(prop => {
    filterParams.push({
      in: 'query',
      name: `${prop.key}_in`,
      description: `
Un filtre pour restreindre les résultats en fonction d'une liste de valeurs acceptées sur la propriété ${prop.key}.
    `,
      schema: {
        type: 'array',
        items: {
          type: 'string',
          enum: prop.enum,
        },
      },
      style: 'commaDelimited',
    })
  })

  const hitsParams = [{
    in: 'query',
    name: 'sort',
    description: `
Le tri à effectuer sous forme d'une liste de clés de champs séparées par des virgules.

Par défaut le tri est ascendant, si un nom de champ est préfixé par un "-" alors le tri sera descendant.

Exemple: ma_colonne,-ma_colonne2`,
    schema: {
      type: 'array',
      default: [],
      items: {
        type: 'string',
        enum: properties,
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
    description: 'La liste des champs à retourner',
    schema: {
      default: ['*'],
      type: 'array',
      items: {
        type: 'string',
        enum: properties,
      },
    },
    style: 'commaDelimited',
  }, {
    in: 'query',
    name: 'thumbnail',
    description: `
Demande à retourner un lien de vignette d'une dimension déterminée à partir d'un champ image.

Pour que ce paramètre soit accepté le concept "Image" doit être associé à un champ du jeu de données.

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

La valeur est une liste de champs séparés par des virgules.
    `,
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: textProperties,
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
    description: 'Le champ sur lequel effectuer la calcul de métrique',
    schema: {
      type: 'string',
    },
  }
  if (numberProperties.length) {
    metricFieldParam.schema.enum = numberProperties
  }

  const formatParam = {
    in: 'query',
    name: 'format',
    description: 'Le format de la donnée. json par défaut, geojson et pbf pour tuiles vectorielles.',
    schema: {
      default: 'json',
      enum: ['json'].concat(dataset.bbox && dataset.bbox.length === 4 ? ['pbf', 'geojson'] : []),
    },
  }

  let securitySchemes = {
    apiKey: {
      type: 'apiKey',
      in: 'header',
      name: 'x-apiKey',
    },
    sdCookie: {
      type: 'apiKey',
      in: 'cookie',
      name: 'id_token',
    },
  }
  let security = [{ apiKey: [] }, { sdCookie: [] }]

  let description = `
Cette documentation interactive à destination des développeurs permet de gérer et consommer les ressources du jeu de données "${dataset.title || dataset.id}".
`

  if (dataset.isVirtual) {
    description += `
Ce jeu de données est virtuel. C'est à dire qu'il est constitué de redirections vers un ensemble de jeux de données et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
  }

  if (dataset.isRest) {
    description += `
Ce jeu de données est incrémental. C'est à dire qu'il est constitué dynamiquement à partir de lectures / écritures de lignes et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
  }

  description += `
Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :

  - ${userApiRate}
  `

  if (visibility(dataset) !== 'public') {
    description += `
Pour utiliser cette API dans un programme vous aurez besoin d'une clé que vous pouvez créer dans les paramètres d'un compte possédant les permissions nécessaires aux opérations que vous souhaitez effectuer.
`
  } else {
    // no need to present complex security schemes if the data is public anyway
    securitySchemes = {}
    security = []
    description += `
    - ${anonymousApiRate}
    `
  }

  const hostname = new URL(config.masterDataPublicUrl).hostname
  const servers = [{
    url: `${config.publicUrl}/api/v1/datasets/${dataset.id}`,
    description: `Instance DataFair - ${hostname}`,
  }]
  if (dataset.masterData && dataset.masterData.length && config.masterDataPublicUrl && config.masterDataPublicUrl !== config.publicUrl) {
    servers.push({
      url: `${config.masterDataPublicUrl}/api/v1/datasets/${dataset.id}`,
      description: `Accès DataFair MasterData - ${hostname}`,
    })
  }

  const api = {
    openapi: '3.1.0',
    info: {
      title: `API du jeu de données : ${dataset.title || dataset.id}`,
      description,
      version,
      'x-api-id': `${new URL(config.publicUrl).hostname.replace(/\./g, '-')}-dataset-${dataset.id}`,
      ...config.info,
    },
    components: {
      securitySchemes,
      schemas: { datasetSchema },
    },
    security,
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
        patch: {
          summary: 'Mettre à jour les informations du jeu de données.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          requestBody: {
            description: 'Fichier à charger et informations de propriété',
            required: true,
            content: {
              'application/json': {
                schema: datasetPatchSchema,
              },
            },
          },
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
                schema: datasetPost,
              },
            },
          },
          responses: {
            200: {
              description: 'Métadonnées sur le dataset modifié',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' },
                },
              },
            },
          },
        },
        delete: {
          summary: 'Supprimer le jeu de données.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Métadonnées'],
          responses: {
            204: {
              description: 'Suppression effectuée',
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
          }, formatParam].concat(filterParams).concat(hitsParams),
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
          summary: 'Récupérer des informations agrégées en fonction des valeurs d\'un champ.',
          operationId: 'getValuesAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'Le champ en fonction des valeurs duquel grouper les lignes du jeu de données',
            schema: {
              type: 'string',
              enum: properties,
            },
          }, formatParam, metricParam, metricFieldParam, aggSizeParam].concat(filterParams).concat(hitsParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'un champ.',
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
          summary: 'Récupérer la liste des valeurs distinctes d\'un champ éventuellement filtrée par le paramètre q.',
          operationId: 'getValues',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'path',
            name: 'field',
            description: 'Le champ duquel lister les valeurs',
            required: true,
            schema: {
              type: 'string',
              enum: properties,
            },
          }].concat(filterParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'un champ.',
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
            description: 'Le champ sur lequel effectuer l\'analyse',
            required: true,
            schema: {
              type: 'string',
              enum: properties,
            },
          }, {
            in: 'query',
            name: 'analysis',
            description: 'Le type d\'analyse textuelle effectuée sur le champ. L\'analyse "lang" est intelligente en fonction de la langue, elle calcule la racine grammaticale des mots et ignore les mots les moins significatifs. L\'analyse "standard" effectue un travail plus basique d\'extraction de mots bruts depuis le texte.',
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
      '/api-docs.json': {
        get: {
          summary: 'Accéder à la documentation de l\'API',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'La documentation de l\'API',
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
      '/journal': {
        get: {
          summary: 'Accéder au journal',
          operationId: 'readJournal',
          'x-permissionClass': 'readAdvanced',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Le journal.',
              content: {
                'application/json': {
                  schema: journalSchema,
                },
              },
            },
          },
        },
      },
      '/schema': {
        get: {
          summary: 'Récupérer la liste des champs filtrable',
          operationId: 'readSchema',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          parameters: [
            utils.filterParam('type', 'Filtre sur le type de champ', ['string', 'boolean', 'integer', 'number']),
            utils.filterParam('format', 'Filtre sur de format d\'un champ de type chaine de caractère', ['uri-reference', 'date', 'date-time']),
            {
              in: 'query',
              name: 'enum',
              description: 'Restreindre aux champs ayant une énumération de valeurs (moins de 50 valeurs distinctes)',
              schema: {
                type: 'boolean',
              },
            },
          ],
          responses: {
            200: {
              description: 'La liste des champs.',
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
      '/_diagnose': {
        get: {
          summary: 'Récupérer des informations techniques',
          tags: ['Administration'],
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Informations techniques de diagnostic',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/_reindex': {
        post: {
          summary: 'Forcer la reindexation',
          tags: ['Administration'],
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'accusé de réception de la demande reindexation',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/_refinalize': {
        post: {
          summary: 'Forcer la re-finalisation',
          tags: ['Administration'],
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'accusé de réception de la demande re-finalisation',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/permissions': permissionsDoc,
      ...masterData.endpoints(dataset),
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/',
    },
  }

  if (dataset.isVirtual || dataset.isRest) {
    delete api.paths['/raw']
    delete api.paths['/full']
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
  return api
}
