const _config = require('config')
const prettyBytes = require('pretty-bytes')
const datasetSchema = require('./dataset')
const masterData = require('./master-data')
const dataFiles = require('./data-files')
const capabilities = require('./capabilities')
const datasetUtils = require('../server/datasets/utils')
const { acceptedMetricAggs } = require('../server/datasets/es/metric-agg')
const utils = require('./utils')
const version = require('../package.json').version

const config = /** @type {any} */(_config)

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
const apiRate = (key, label) => {
  // @ts-ignore
  const defaultLimits = config.defaultLimits
  return `Un utilisateur ${label} ne peut pas effectuer plus de ${defaultLimits.apiRate[key].nb} requêtes par interval de ${defaultLimits.apiRate[key].duration} seconde${defaultLimits.apiRate[key].duration > 1 ? 's' : ''}.
  Sa vitesse de téléchargement totale sera limitée à ${prettyBytes(defaultLimits.apiRate[key].bandwidth.static)}/s pour les contenus statiques (fichiers de données, pièces jointes, etc.) et à ${prettyBytes(defaultLimits.apiRate[key].bandwidth.dynamic)}/s pour les autres appels.`
}
const userApiRate = apiRate('user', 'authentifié (session ou clé d\'API)')
const anonymousApiRate = apiRate('anonymous', 'anonyme')

/**
 * @param {any} dataset
 * @param {string} [publicUrl]
 * @param {any} [ownerInfo]
 * @param {any} [publicationSite]
 */
// @ts-ignore
module.exports = (dataset, publicUrl = config.publicUrl, ownerInfo, publicationSite) => {
  const schema = dataset.schema || []
  const datasetLineSchema = datasetUtils.jsonSchema(schema, publicUrl)

  const bulkLineSchema = datasetUtils.jsonSchema(schema.filter((/** @type {any} */ p) => !p['x-calculated'] && !p['x-extension']), publicUrl)
  bulkLineSchema.properties._action = {
    type: 'string',
    title: 'Action',
    enum: ['create', 'delete', 'update', 'patch'],
    description: `
- create: créé la ligne
- delete: supprime la ligne, nécessite la présence de _id
- update: remplate la ligne, nécessite la présence de _id
- patch: modifie la ligne, nécessite la présence de _id
    `
  }

  const stringProperties = schema
    .filter((/** @type {any} */ p) => !p['x-calculated'] && p.type === 'string' && (!p.format || p.format === 'uri-reference'))
  const textSearchProperties = stringProperties
    .filter((/** @type {any} */ p) => !p['x-capabilities'] || p['x-capabilities'].text !== false || p['x-capabilities'].textStandard !== false)
  const textAggProperties = stringProperties
    .filter((/** @type {any} */ p) => !p['x-capabilities'] || p['x-capabilities'].textAgg !== false)
  const stringValuesProperties = stringProperties
    .filter((/** @type {any} */ p) => !p['x-capabilities'] || p['x-capabilities'].values !== false)
  const valuesProperties = schema
    .filter((/** @type {any} */ p) => !p['x-capabilities'] || p['x-capabilities'].values !== false)
  const numberProperties = schema
    .filter((/** @type {any} */ p) => p.type === 'number')
  const imageProperty = schema.find((/** @type {any} */f) => f['x-refersTo'] === 'http://schema.org/image')

  const filterParams = [{
    in: 'query',
    name: 'q',
    description: `
  Colonne de recherche simple. Ce paramètre peut-être utilisé pour exposer une fonctionalité de recherche textuelle riche aux utilisateurs sans risque de créer des erreurs de syntaxe.

  Exemple: "open data" | "open source"

  Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html) correspondante.
    `,
    schema: {
      type: 'string'
    }
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
      enum: [null, 'simple', 'complete']
    }
  }, {
    in: 'query',
    name: 'q_fields',
    description: `
  Ce paramètre permet de spécifier les colonnes sur lesquelles appliquer le paramètre "q".

  Par défaut toutes les colonnes supportant une recherche textuelle sont utilisées.
    `,
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: textSearchProperties.length ? textSearchProperties.map((/** @type {any} */ p) => p.key) : undefined
      }
    },
    style: 'form',
    explode: false
  }, {
    in: 'query',
    name: 'qs',
    description: `
Colonne de filtre et recherche textuelle avancée. Ce paramètre permet d'effectuer des requêtes complexes sur la source de données. Vous pouvez spécifier des filtres par colonne, créer des combinaisons logiques à volonté, etc.

Exemple: ma_colonne:"du texte" AND ma_colonne2:valeur

Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html) correspondante.
  `,
    schema: {
      type: 'string'
    }
  }]
  if (dataset.bbox && dataset.bbox.length === 4) {
    filterParams.push({
      in: 'query',
      name: 'bbox',
      description: "Un filtre pour restreindre les résultats à une zone géographique. Le format est 'gauche,bas,droite,haut' autrement dit 'lonMin,latMin,lonMax,latMax'.",
      schema: {
        type: 'string'
      }
    })
    filterParams.push({
      in: 'query',
      name: 'xyz',
      description: `
  Un filtre pour restreindre les résultats à une zone géographique avec les paramètres standards de tuiles géographiques x,y et z.

  Le format est 'x,y,z'.
    `,
      schema: {
        type: 'string'
      }
    })
    filterParams.push({
      in: 'query',
      name: 'geo_distance',
      description: `
  Un filtre pour restreindre les résultats à moins d'une certaine distance du point passé en paramètre.

  Le format est 'lon:lat:distance'. La distance optionnelle (0 par défaut) et est exprimée en mètres.

  Si les documents contiennent des géométries la distance est calculée à partir de leurs centroïdes à moins que la distance soit 0 auquel cas le filtre retourne tous les documents dont la géométrie contient le point passé en paramètre.
    `,
      schema: {
        type: 'string'
      }
    })
  }

  const hitsParams = (defaultSize = 12, maxSize = 10000) => {
    /** @type {any[]} */
    const params = [{
      in: 'query',
      name: 'size',
      description: `Le nombre de résultats à retourner (taille de la pagination), ${defaultSize} par défaut`,
      schema: {
        default: defaultSize,
        type: 'integer',
        maximum: maxSize
      }
    }, {
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
          enum: valuesProperties.length ? valuesProperties.map((/** @type {any} */ p) => p.key) : undefined
        }
      },
      style: 'form',
      explode: false
    }, {
      in: 'query',
      name: 'select',
      description: 'La liste des colonnes à retourner',
      schema: {
        default: ['*'],
        type: 'array',
        items: {
          type: 'string',
          enum: schema.length ? schema.map((/** @type {any} */ p) => p.key) : undefined
        }
      },
      style: 'form',
      explode: false
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
          enum: textSearchProperties.length ? textSearchProperties.map((/** @type {any} */ p) => p.key) : undefined
        }
      },
      style: 'form',
      explode: false
    }]
    if (imageProperty) {
      params.push({
        in: 'query',
        name: 'thumbnail',
        description: `
Demande à retourner un lien de vignette d'une dimension déterminée à partir d'une colonne image.

Pour que ce paramètre soit accepté le concept "Image" doit être associé à une colonne du jeu de données.

La valeur du paramètre est la dimension passée sous la form largeurxhauteur (300x200 par exemple) où un 0 sur la largeur ou la hauteur signifie que l'autre valeur est prise en compte et les proportions conservées.
    `,
        schema: {
          type: 'string'
        }
      })
    }
    if (dataset.bbox && dataset.bbox.length === 4) {
      params.push({
        in: 'query',
        name: 'sampling',
        description: `
  **Uniquement avec le paramètre de tuilage xyz**. Configure le mode d'échantillonage des resultats pour privilégier soit l'exhaustivité des données soit une densité plus homogène sur la carte.
  
    - **neighbors** (défaut) : utilise la densité maximale parmi les tuiles voisines pour réduire la densité de la tuile courante au même niveau d'échantillonage (couteux en performance).
    - **max** : retourne le maximum (limité par le paramètre size) de résultat pour chaque tuile.
      `,
        schema: {
          type: 'string',
          enum: [null, 'neighbors', 'max']
        }
      })
    }
    return params
  }

  const aggSizeParam = {
    in: 'query',
    name: 'agg_size',
    description: 'Le nombre de buckets pour l\'agrégation (défaut 20)',
    schema: {
      default: 20,
      type: 'integer',
      maximum: 10000
    }
  }

  const metricFieldParam = {
    in: 'query',
    name: 'metric_field',
    description: 'La colonne sur lequel effectuer la calcul de métrique',
    schema: {
      type: 'string',
      enum: numberProperties.length ? numberProperties.map((/** @type {any} */ p) => p.key) : undefined
    }
  }

  const formatParam = {
    in: 'query',
    name: 'format',
    description: `Le format de sérialisation de la donnée.
  
  - **json** (défaut)
  - **csv** pour format compatibles tableurs
  - **pbf** pour tuiles vectorielles
  - **geojson** et **wkt** pour formats géographiques`,
    schema: {
      enum: [null, 'json', 'csv', 'xlsx', 'ods'].concat(dataset.bbox && dataset.bbox.length === 4 ? ['pbf', 'geojson', 'wkt'] : [])
    }
  }

  const htmlParam = {
    in: 'query',
    name: 'html',
    description: 'Effectuer le rendu des contenus formattés de **markdown** vers **HTML**',
    schema: {
      type: 'boolean'
    }
  }

  /* TODO: add this when dataset is public and finalizedAt is filled
  const finalizedAtParam = {
    in: 'query',
    name: 'finalizedAt',
    description: 'La date de finalisation du jeu de données (propriété finalizedAt). Utilisée pour optimiser l\'utilisation de cache et améliorer la performance',
    schema: {
      type: 'string'
    }
  } */

  let description = `
Cette documentation interactive à destination des développeurs permet de consommer les ressources du jeu de données "${dataset.title || dataset.slug}".
`

  description += `
Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :

- ${anonymousApiRate}
- ${userApiRate}
  `

  /**
   * @param {any} safe
   * @returns {any}
   */
  const readSchema = (safe) => ({
    summary: `Récupérer la liste des colonnes${safe ? ' - les indices sur le contenu de la donnée sont purgés' : ''}`,
    operationId: safe ? 'readSafeSchema' : 'readSchema',
    'x-permissionClass': 'read',
    tags: ['Métadonnées'],
    parameters: [
      {
        in: 'query',
        name: 'mimeType',
        description: 'Définir le format du schéma',
        required: false,
        schema: {
          type: 'string',
          default: 'application/json',
          enum: ['application/json', 'application/tableschema+json', 'application/schema+json']
        }
      },
      utils.filterParam('type', 'Filtre sur le type de colonne', ['string', 'boolean', 'integer', 'number']),
      utils.filterParam('format', 'Filtre sur de format d\'une colonne de type chaine de caractère', ['uri-reference', 'date', 'date-time']),
      {
        in: 'query',
        name: 'capability',
        description: 'Restreindre aux colonnes ayant une capacité particulière',
        required: false,
        schema: {
          type: 'string',
          enum: [null, ...Object.keys(capabilities.properties)]
        }
      },
      {
        in: 'query',
        name: 'enum',
        description: 'Restreindre aux colonnes ayant une énumération de valeurs (moins de 50 valeurs distinctes)',
        required: false,
        schema: {
          type: 'string',
          enum: ['false', 'true']
        }
      },
      {
        in: 'query',
        name: 'calculated',
        description: 'Include les colonnes calculées (non issues du fichier d\'origine)',
        required: false,
        schema: {
          type: 'string',
          enum: ['true', 'false']
        }
      }
    ],
    responses: {
      200: {
        description: 'La liste des colonnes',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          }
        }
      }
    }
  })

  const servers = [{
    url: `${publicUrl}/api/v1/datasets/${publicationSite ? dataset.slug : dataset.id}`,
    description: `Jeu de données Data Fair - ${new URL(publicUrl).hostname} - ${dataset.title}`
  }]

  /** @type {any} */
  const info = {
    title: `API publique du jeu de données : ${dataset.title || dataset.slug}`,
    description,
    version,
    'x-api-id': `${new URL(publicUrl).hostname.replace(/\./g, '-')}-dataset-${dataset.id}`,
    contact: { ...(ownerInfo.contact || {}) }
  }
  if (config.info.termsOfService) info.termsOfService = config.info.termsOfService

  /** @type {any} */
  const api = {
    openapi: '3.1.0',
    info,
    components: {
      securitySchemes: {},
      schemas: {
        datasetSchema
      }
    },
    security: [],
    servers,
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations du jeu de données',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Les informations du jeu de données',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/datasetSchema' }
                }
              }
            }
          }
        }
      },
      '/data-files': {
        get: {
          summary: 'Récupérer la liste des fichiers de données',
          operationId: 'readDataFiles',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le résultat de la requête',
              content: {
                'application/json': {
                  schema: dataFiles
                }
              }
            }
          }
        }
      },
      '/lines': {
        get: {
          summary: 'Requêter les lignes du jeu de données',
          operationId: 'readLines',
          'x-permissionClass': 'read',
          tags: ['Données'],
          // @ts-ignore
          parameters: [{
            in: 'query',
            name: 'page',
            description: 'Le numéro de la page (indice de la pagination). Débute à 1. Pour paginer sur de gros volumes de données utilisez plutôt le paramètre after',
            schema: {
              default: 1,
              type: 'integer'
            }
          }, {
            in: 'query',
            name: 'after',
            description: 'Pagination en profondeur. Automatiquement renseigné par la propriété next du résultat de la requête précédente',
            schema: {
              default: 1,
              type: 'integer'
            }
          // @ts-ignore
          }].concat(hitsParams()).concat([formatParam, htmlParam]).concat(filterParams).concat([{
            in: 'query',
            name: 'collapse',
            description: 'Afficher une ligne de résultat par valeur distince d\'un champ',
            schema: {
              type: 'string',
              // @ts-ignore
              enum: [null].concat(stringValuesProperties.map((/** @type {any} */ p) => p.key))
            }
          }]),
          responses: {
            200: {
              description: 'Le résultat de la requête',
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
                        description: 'Le tableau de résultats',
                        items: datasetLineSchema
                      },
                      next: {
                        type: 'string',
                        description: 'URL pour continuer la pagination'
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
          summary: 'Récupérer des informations agrégées en fonction des valeurs d\'une colonne',
          operationId: 'getValuesAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'La colonne en fonction des valeurs desquelles grouper les lignes du jeu de données',
            required: true,
            schema: {
              type: 'string',
              enum: stringValuesProperties.length ? stringValuesProperties.map((/** @type {any} */ p) => p.key) : undefined
            }
          }, formatParam, htmlParam, {
            in: 'query',
            name: 'metric',
            description: 'La métrique à appliquer',
            schema: {
              type: 'string',
              enum: ['avg', 'sum', 'min', 'max']
            }
          }, metricFieldParam, aggSizeParam].concat(filterParams).concat(hitsParams(0, 100)),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les informations du jeu de données agrégées par valeurs d\'une colonne',
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
      '/values/{field}': {
        get: {
          summary: 'Récupérer la liste des valeurs distinctes d\'une colonne éventuellement filtrée par le paramètre q',
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
              enum: stringValuesProperties.length ? stringValuesProperties.map((/** @type {any} */ p) => p.key) : undefined
            }
          }, {
            in: 'query',
            name: 'size',
            description: 'Le nombre de résultats à retourner (taille de la pagination). 10 par défaut',
            schema: {
              default: 10,
              type: 'integer',
              maximum: 10000
            }
          // @ts-ignore
          }].concat(filterParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Les valeurs d\'une colonne',
              content: {
                'application/json': {
                  schema: {
                    type: 'array'
                  }
                }
              }
            }
          }
        }
      },
      '/metric_agg': {
        get: {
          summary: 'Calculer une métrique sur un ensemble de lignes',
          operationId: 'getMetricAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [
            {
              in: 'query',
              name: 'metric',
              description: 'La métrique à appliquer',
              required: true,
              schema: {
                type: 'string',
                enum: acceptedMetricAggs
              }
            },
            {
              in: 'query',
              name: 'field',
              description: 'La colonne sur laquelle calculer la métrique',
              schema: {
                type: 'string',
                enum: valuesProperties.length ? schema.map((/** @type {any} */ p) => p.key) : undefined
              },
              required: true
            },
            {
              in: 'query',
              name: 'percents',
              description: 'Les pourcentages sur lesquels calculer la métrique percentiles (inutile pour les autres métriques). La valeur par défaut est "1,5,25,50,75,95,99"',
              required: false,
              schema: {
                type: 'string'
              }
            }
          // @ts-ignore
          ].concat(filterParams),
          responses: {
            200: {
              description: 'Le résultat du calcul',
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
      '/simple_metrics_agg': {
        get: {
          summary: 'Calculer des métriques simples standards sur toutes les colonnes possibles ou sur une liste de colonnes',
          operationId: 'getSimpleMetricsAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [
            {
              in: 'query',
              name: 'fields',
              description: 'Les colonnes sur lesquelles calculer les métriques',
              schema: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: valuesProperties.length ? schema.map((/** @type {any} */ p) => p.key) : undefined
                }
              },
              style: 'form',
              explode: false
            }
          // @ts-ignore
          ].concat(filterParams),
          responses: {
            200: {
              description: 'Le résultat du calcul',
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
          summary: 'Récupérer des mots significatifs dans un jeu de données',
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
              enum: textAggProperties.length ? textAggProperties.map((/** @type {any} */ p) => p.key) : undefined
            }
          }, {
            in: 'query',
            name: 'analysis',
            description: 'Le type d\'analyse textuelle effectuée sur la colonne. L\'analyse "lang" est intelligente en fonction de la langue, elle calcule la racine grammaticale des mots et ignore les mots les moins significatifs. L\'analyse "standard" effectue un travail plus basique d\'extraction de mots bruts depuis le texte',
            schema: {
              type: 'string',
              default: 'lang',
              enum: ['lang', 'standard']
            }
          // @ts-ignore
          }].concat(filterParams),
          // TODO: document sort param and interval
          responses: {
            200: {
              description: 'Le résultat de l\'analyse',
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
              description: 'Le jeu de données',
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
              description: 'Le jeu de données',
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
      '/schema': {
        get: readSchema(false)
      },
      '/safe-schema': {
        get: readSchema(true)
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
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      },
      ...masterData.endpoints(dataset)
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io'
    }
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
  if (valuesProperties.length === 0) {
    delete api.paths['/metric_agg']
    delete api.paths['/simple_metrics_agg']
  }

  if (dataset.bbox && dataset.bbox.length === 4) {
    api.paths['/geo_agg'] = {
      get: {
        summary: 'Récupérer des informations agrégées spatialement sur le jeu de données',
        operationId: 'getGeoAgg',
        'x-permissionClass': 'read',
        tags: ['Données'],
        // @ts-ignore
        parameters: [aggSizeParam].concat(filterParams).concat(hitsParams(0, 100)).concat([formatParam, htmlParam]),
        responses: {
          200: {
            description: 'Les informations du jeu de données agrégées spatialement',
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

  if (dataset.rest && dataset.rest.history) {
    const size = hitsParams().find((/** @type {any} */ p) => p.name === 'size')
    const before = {
      in: 'query',
      name: 'before',
      description: 'Pagination pour remonter dans l\'historique. Automatiquement renseigné par la propriété next du résultat de la requête précédente',
      schema: {
        default: 1,
        type: 'integer'
      }
    }
    const revisionsResponses = {
      200: {
        description: 'Les révisions',
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
                  items: bulkLineSchema
                },
                next: {
                  type: 'string',
                  description: 'URL pour continuer la pagination'
                }
              }
            }
          }
        }
      }
    }
    api.paths['/revisions'] = {
      get: {
        parameters: [size, before],
        summary: 'Récupérer les révisions de lignes triées du plus récent au plus ancien',
        operationId: 'readRevisions',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        responses: revisionsResponses
      }
    }
    api.paths['/lines/{lineId}/revisions'] = {
      get: {
        parameters: [{
          in: 'path',
          name: 'lineId',
          description: 'L\'identifiant de la ligne',
          required: true,
          schema: {
            type: 'string'
          }
        }, size, before],
        summary: 'Récupérer les révisions d\'une ligne triées du plus récent au plus ancien',
        operationId: 'readLineRevisions',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        responses: revisionsResponses
      }
    }
  }
  return { api, userApiRate, anonymousApiRate, bulkLineSchema }
}
