import type { Dataset, Settings } from '#types'

import _config from 'config'
import prettyBytes from 'pretty-bytes'
import { resolvedSchema as datasetSchema } from '#types/dataset/index.ts'
import * as masterData from './master-data.js'
import capabilities from './capabilities.js'
import * as datasetUtils from '../src/datasets/utils/index.js'
import { acceptedMetricAggs } from '../src/datasets/es/metric-agg.js'
import * as utils from './utils.js'
import pJson from './p-json.js'
import { hasCapability } from '../src/datasets/es/commons.js'

type DatasetApiDocsSettings = (Pick<Settings, 'info' | 'compatODS'> & Record<string, any>) | null | undefined

const config = _config as any

const dataFiles = datasetSchema.properties.storage.properties.dataFiles

/** Wraps a description into a text/plain OpenAPI response object. */
const textPlainResponse = (description: string) => ({
  description,
  content: {
    'text/plain': { schema: { type: 'string' } }
  }
})

/** Renders the rate-limit blurb describing how many requests/sec a given user role can make. */
const apiRate = (key: 'user' | 'anonymous', label: string): string => {
  const rate = config.defaultLimits.apiRate[key]
  return `Un utilisateur ${label} ne peut pas effectuer plus de ${rate.nb} requêtes par intervalle de ${rate.duration} seconde${rate.duration > 1 ? 's' : ''}.
  Sa vitesse de téléchargement totale sera limitée à ${prettyBytes(rate.bandwidth.static)}/s pour les contenus statiques (fichiers de données, pièces jointes, etc.) et à ${prettyBytes(rate.bandwidth.dynamic)}/s pour les autres appels.`
}
const userApiRate = apiRate('user', "authentifié (session ou clé d'API)")
const anonymousApiRate = apiRate('anonymous', 'anonyme')

/**
 * Builds the public per-dataset OpenAPI documentation served at /datasets/{id}/api-docs.json.
 * Routes that don't apply to the dataset variant (virtual, rest, meta-only, no bbox, ...) are pruned.
 */
export default (dataset: Dataset, publicUrl: string = config.publicUrl, settings?: DatasetApiDocsSettings, publicationSite?: unknown) => {
  const ownerInfo = settings?.info || {}
  const schema: any[] = (dataset as any).schema || []
  const datasetLineSchema = datasetUtils.jsonSchema(schema, publicUrl)

  const bulkLineSchema = datasetUtils.jsonSchema(schema.filter((p: any) => !p['x-calculated'] && !p['x-extension']), publicUrl)
  bulkLineSchema.properties._action = {
    type: 'string',
    title: 'Action',
    enum: ['create', 'delete', 'update', 'createOrUpdate', 'patch'],
    description: `
- create: crée la ligne
- delete: supprime la ligne, nécessite la présence de _id
- update: remplace la ligne, nécessite la présence de _id
- createOrUpdate: crée la ligne si elle n'existe pas, sinon la remplace
- patch: modifie la ligne, nécessite la présence de _id
    `
  }

  const stringProperties = schema
    .filter((p: any) => !p['x-calculated'] && p.type === 'string' && (!p.format || p.format === 'uri-reference'))
  const textSearchProperties = stringProperties
    .filter((p: any) => !p['x-capabilities'] || p['x-capabilities'].text !== false || p['x-capabilities'].textStandard !== false)
  const textAggProperties = stringProperties
    .filter((p: any) => !p['x-capabilities'] || p['x-capabilities'].textAgg !== false)
  const valuesProperties = schema
    .filter((p: any) => !p.key.startsWith('_geo'))
    .filter((p: any) => !p['x-capabilities'] || p['x-capabilities'].values !== false)
  const imageProperty = schema.find((f: any) => f['x-refersTo'] === 'http://schema.org/image')
  const documentProperty = schema.find((f: any) => f['x-refersTo'] === 'http://schema.org/DigitalDocument')

  // Detect whether we're rendering the merged doc (sample dataset with placeholder id like "{datasetId}")
  // vs an actual per-dataset doc. In the merged case, the column-based filter dropdown would
  // expose sample column names (Nom, Description, ...) that aren't useful, so we hide it.
  const isSampleDataset = typeof (dataset as any).id === 'string' && (dataset as any).id.startsWith('{')

  const filterItems: any[] = []
  if (!isSampleDataset) {
    for (const p of schema) {
      if (hasCapability(p, 'index') || hasCapability(p, 'wildcard') || hasCapability(p, 'text') || hasCapability(p, 'textStandard')) {
        filterItems.push({ header: true, title: p.title ?? p['x-originalName'] ?? p.key })
      }
      if (hasCapability(p, 'index')) {
        filterItems.push(p.key + '_eq')
        filterItems.push(p.key + '_neq')
        filterItems.push(p.key + '_in')
        filterItems.push(p.key + '_nin')
        filterItems.push(p.key + '_lt')
        filterItems.push(p.key + '_lte')
        filterItems.push(p.key + '_gt')
        filterItems.push(p.key + '_gte')
        filterItems.push(p.key + '_starts')
        filterItems.push(p.key + '_exists')
        filterItems.push(p.key + '_nexists')
      }
      if (hasCapability(p, 'wildcard')) {
        filterItems.push(p.key + '_contains')
      }
      if (hasCapability(p, 'textStandard') || hasCapability(p, 'text')) {
        filterItems.push(p.key + '_search')
      }
    }
  }

  const filterParams: any[] = [{
    in: 'query',
    name: 'q',
    description: `
  Colonne de recherche simple. Ce paramètre peut être utilisé pour exposer une fonctionnalité de recherche textuelle riche aux utilisateurs sans risque de créer des erreurs de syntaxe.

  Exemple : \`"open data" | "open source"\`

  Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html) correspondante.
    `,
    schema: {
      title: 'Recherche textuelle',
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
      title: 'Mode de recherche',
      type: 'string',
      default: 'simple',
      enum: ['simple', 'complete']
    }
  }, {
    in: 'query',
    name: 'q_fields',
    description: `
  Ce paramètre permet de spécifier les colonnes sur lesquelles appliquer le paramètre "q".

  Par défaut toutes les colonnes supportant une recherche textuelle sont utilisées.
    `,
    schema: {
      title: 'Colonnes de recherche',
      type: 'array',
      items: {
        type: 'string',
        enum: textSearchProperties.length ? textSearchProperties.map((p: any) => p.key) : undefined
      }
    },
    style: 'form',
    explode: false
  }, {
    // free-form query parameters support for open api v3
    // cf https://stackoverflow.com/questions/49582559/how-to-document-dynamic-query-parameter-names-in-openapi-swagger
    in: 'query',
    name: 'filters',
    schema: {
      type: 'object',
      title: 'Filtres sur colonnes',
      patternPropertiesLayout: {
        ...(filterItems.length ? { items: filterItems } : {}),
        messages: {
          addItem: 'Ajouter un filtre'
        },
        help: `Filtres structurés sur colonne.

Le nom est constitué de la clé de la colonne concaténée avec un suffixe par type de filtre (par exemple \`ma_colonne_eq\`, \`ma_colonne_in\`, etc.).

Les types de filtres disponibles peuvent varier par colonne.

  - \`_eq\` : égal à une valeur
  - \`_neq\` : différent d'une valeur
  - \`_in\` : appartient à une liste de valeurs (séparées par des virgules)
  - \`_nin\` : n'appartient pas à une liste de valeurs (séparées par des virgules)
  - \`_gt\` : strictement supérieur à une valeur
  - \`_gte\` : supérieur ou égal à une valeur
  - \`_lt\` : strictement inférieur à une valeur
  - \`_lte\` : inférieur ou égal à une valeur
  - \`_starts\` : commence par une série de caractères
  - \`_contains\` : contient une série de caractères
  - \`_search\` : effectue une recherche textuelle simple
  - \`_exists\` : la colonne contient une valeur
  - \`_nexists\` : la colonne ne contient pas une valeur
  `
      },
      patternProperties: {
        '.*': {
          type: 'string',
          default: '',
          layout: {
            placeholder: 'saisissez la valeur du filtre'
          }
        }
      }
    }
  }, {
    in: 'query',
    name: 'qs',
    description: `
Colonne de filtre et recherche textuelle avancée. Ce paramètre permet d'effectuer des requêtes complexes sur la source de données. Vous pouvez spécifier des filtres par colonne, créer des combinaisons logiques à volonté, etc.

**Attention**, ce paramètre est d'utilisation technique et n'est vraiment nécessaire que pour effectuer des combinaisons logiques particulières. Dans la majorité des cas il est recommandé d'utiliser "Filtres sur colonnes" ci-dessus.

Exemple : \`ma_colonne:"du texte" AND ma_colonne2:valeur\`

Pour plus d'information voir la documentation [ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html) correspondante.
  `,
    schema: {
      title: 'Recherche textuelle avancée',
      type: 'string'
    }
  }]

  const hasBbox = !!((dataset as any).bbox && (dataset as any).bbox.length === 4)

  if (hasBbox) {
    filterParams.push({
      in: 'query',
      name: 'bbox',
      description: "Un filtre pour restreindre les résultats à une zone géographique. Le format est 'gauche,bas,droite,haut' autrement dit 'lonMin,latMin,lonMax,latMax'.",
      schema: {
        title: 'Filtre par zone géographique',
        type: 'string',
        examples: ['2.2241,48.8156,2.4699,48.9022']
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
        title: 'Filtre par tuile géographique',
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
        title: 'Filtre par distance géographique',
        type: 'string'
      }
    })
  }

  /** Returns the common pagination/sort/select parameters shared by routes that return hits or aggregations. */
  const hitsParams = (defaultSize = 12, maxSize = 10000, method?: string): any[] => {
    let sortItems: string[] = []
    if (method === 'values_agg') {
      sortItems = ['metric', '-metric', 'count', '-count', 'key', '-key']
    }
    for (const valuesProperty of valuesProperties) {
      sortItems.push(valuesProperty.key)
      sortItems.push('-' + valuesProperty.key)
    }

    const params: any[] = [{
      in: 'query',
      name: 'size',
      description: 'Le nombre de résultats à retourner (taille de la pagination).',
      schema: {
        title: 'Taille de la pagination',
        default: defaultSize,
        type: 'integer',
        maximum: maxSize
      }
    }, {
      in: 'query',
      name: 'sort',
      description: method === 'values_agg'
        ? `
Le tri à effectuer sous forme d'une liste de clés séparées par des virgules.

Pour chaque niveau d'agrégation il est possible de trier par le nombre d'éléments dans le groupe ("count" et "-count") ou par la clé du groupe ("key" et "-key").

Ensuite il est possible d'ajouter des instructions de tri pour les résultats imbriqués dans le dernier niveau d'agrégation sous forme d'une liste de clés de colonnes.

Exemple : \`-count,key,ma_colonne,-ma_colonne2\``
        : `
Le tri à effectuer sous forme d'une liste de clés de colonnes séparées par des virgules.

Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple : \`ma_colonne,-ma_colonne2\``,
      schema: {
        title: 'Ordre des résultats',
        type: 'array',
        items: {
          type: 'string',
          enum: sortItems
        }
      },
      style: 'form',
      explode: false
    }, {
      in: 'query',
      name: 'select',
      description: 'La liste des colonnes à retourner.',
      schema: {
        title: 'La liste des colonnes à retourner',
        type: 'array',
        items: {
          type: 'string',
          enum: schema.length ? schema.map((p: any) => p.key) : undefined
        },
        default: 'all'
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
          enum: textSearchProperties.length ? textSearchProperties.map((p: any) => p.key) : undefined
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
    if (hasBbox) {
      params.push({
        in: 'query',
        name: 'sampling',
        description: `
  **Uniquement avec le paramètre de tuilage xyz**. Configure le mode d'échantillonnage des résultats pour privilégier soit l'exhaustivité des données soit une densité plus homogène sur la carte.

    - **neighbors** (défaut) : utilise la densité maximale parmi les tuiles voisines pour réduire la densité de la tuile courante au même niveau d'échantillonnage (coûteux en performance).
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
    description: "Le nombre de buckets pour l'agrégation.",
    schema: {
      default: 20,
      type: 'integer',
      maximum: 10000
    }
  }

  const formatParam = {
    in: 'query',
    name: 'format',
    description: `Le format de sérialisation de la donnée.

  - **json** (défaut)
  - **csv** pour formats compatibles tableurs
  - **pbf** pour tuiles vectorielles
  - **geojson**, **shp**, **wkt** pour formats géographiques`,
    schema: {
      title: 'Format de sérialisation',
      default: 'json',
      type: 'string',
      enum: ['json', 'csv', 'xlsx', 'ods'].concat(hasBbox ? ['pbf', 'geojson', 'shp', 'wkt'] : [])
    }
  }

  const htmlParam = {
    in: 'query',
    name: 'html',
    description: 'Effectuer le rendu des contenus formatés de **markdown** vers **HTML**.',
    schema: {
      title: 'Rendu HTML des contenus markdown',
      type: 'boolean'
    }
  }

  const description = `
Cette documentation interactive à destination des développeurs permet de consommer les ressources du jeu de données "**${dataset.title || (dataset as any).slug}**".

Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :

- ${anonymousApiRate}
- ${userApiRate}
  `

  // Standard error responses ($refs to components.responses below).
  const readErrorResponses = {
    401: { $ref: '#/components/responses/Unauthorized' },
    403: { $ref: '#/components/responses/Forbidden' },
    404: { $ref: '#/components/responses/NotFound' }
  }
  const errorResponses = {
    400: { $ref: '#/components/responses/BadRequest' },
    ...readErrorResponses
  }

  /** Builds the operation object for /schema and /safe-schema (the safe variant hides cardinality and enums). */
  const readSchema = (safe: boolean) => ({
    summary: safe ? 'Lire le schéma réduit' : 'Lire le schéma',
    description: safe
      ? 'Récupérer la liste des colonnes et leurs détails.\n*Les valeurs distinctes (`enum`) et la cardinalité (`x-cardinality`) ne sont pas exposées.*'
      : 'Récupérer la liste des colonnes et leurs détails, incluant la cardinalité (`x-cardinality`) et les énumérations de valeurs distinctes (`enum`).',
    operationId: safe ? 'readSafeSchema' : 'readSchema',
    'x-permissionClass': 'read',
    tags: ['Métadonnées'],
    parameters: [
      {
        in: 'query',
        name: 'mimeType',
        description: 'Définir le format du schéma.',
        required: false,
        schema: {
          title: 'Format du schéma',
          type: 'string',
          default: 'application/json',
          enum: ['application/json', 'application/tableschema+json', 'application/schema+json']
        }
      },
      utils.filterParam('type', 'Filtre sur le type de colonne', undefined, ['string', 'boolean', 'integer', 'number']),
      utils.filterParam('format', "Filtre sur le format d'une colonne", "Filtre sur le format d'une colonne de type chaîne de caractères", ['uri-reference', 'date', 'date-time']),
      {
        in: 'query',
        name: 'capability',
        description: 'Restreindre aux colonnes ayant une capacité particulière.',
        required: false,
        schema: {
          title: 'Restreindre par capacité de la colonne',
          type: 'string',
          enum: [null, ...Object.keys(capabilities.properties)]
        }
      },
      {
        in: 'query',
        name: 'enum',
        description: 'Restreindre aux colonnes ayant une énumération de valeurs (moins de 50 valeurs distinctes).',
        required: false,
        schema: {
          title: 'Restreindre par colonnes énumérables',
          type: 'string',
          enum: ['false', 'true']
        }
      },
      {
        in: 'query',
        name: 'calculated',
        description: "Inclure les colonnes calculées (non issues du fichier d'origine).",
        required: false,
        schema: {
          title: 'Inclure les colonnes calculées',
          type: 'string',
          enum: ['true', 'false']
        }
      }
    ],
    responses: {
      200: {
        description: 'La liste des colonnes.',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { type: 'object' }
            }
          }
        }
      },
      ...readErrorResponses
    }
  })

  const servers = [{
    url: `${publicUrl}/api/v1/datasets/${publicationSite ? (dataset as any).slug : (dataset as any).id}`,
    description: `Jeu de données Data Fair - ${new URL(publicUrl).hostname} - ${dataset.title}`
  }]

  const info: any = {
    title: `API publique du jeu de données : ${dataset.title || (dataset as any).slug}`,
    description,
    version: pJson.version,
    'x-api-id': `${new URL(publicUrl).hostname.replace(/\./g, '-')}-dataset-${(dataset as any).id}`,
    contact: { ...(ownerInfo.contact || {}) }
  }
  if (config.info.termsOfService) info.termsOfService = config.info.termsOfService

  const api: any = {
    openapi: '3.1.0',
    info,
    components: {
      securitySchemes: {},
      schemas: {
        dataset: datasetSchema
      },
      responses: {
        BadRequest: textPlainResponse('Requête invalide : corps de requête mal formé, paramètres manquants ou contraintes métier non respectées.'),
        Unauthorized: textPlainResponse("Non authentifié : aucune session ni clé d'API valide n'a été fournie."),
        Forbidden: textPlainResponse('Permissions insuffisantes pour effectuer cette opération sur le jeu de données.'),
        NotFound: textPlainResponse("Le jeu de données (ou la ressource associée) n'existe pas.")
      }
    },
    security: [],
    servers,
    paths: {
      '/': {
        get: {
          summary: 'Lire les informations',
          description: 'Récupérer les informations du jeu de données.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Les informations du jeu de données.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/dataset' }
                }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/lines': {
        get: {
          summary: 'Lire les lignes',
          description: 'Requêter les lignes du jeu de données.',
          operationId: 'readLines',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'after',
            description: 'Pagination en profondeur.\n\n*Automatiquement renseigné par la propriété **next** du résultat de la requête précédente.*',
            schema: {
              title: 'Pagination en profondeur',
              type: 'integer'
            }
          }, {
            in: 'query',
            name: 'page',
            description: 'Le numéro de la page (indice de la pagination). Débute à 1.\n\n*Pour paginer sur de gros volumes de données utilisez plutôt le paramètre **after***.',
            schema: {
              title: 'Numéro de la page',
              type: 'integer',
              default: 1
            }
          },
          ...hitsParams(),
          formatParam,
          htmlParam,
          ...filterParams,
          {
            in: 'query',
            name: 'collapse',
            description: "Afficher une ligne de résultat par valeur distincte d'un champ.",
            schema: {
              type: 'string',
              enum: [null, ...valuesProperties.map((p: any) => p.key)]
            }
          }],
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
                        description: 'Le nombre total de résultat si on ignore la pagination.'
                      },
                      results: {
                        type: 'array',
                        description: 'Le tableau de résultats.',
                        items: datasetLineSchema
                      },
                      next: {
                        type: 'string',
                        description: 'URL pour continuer la pagination.'
                      }
                    }
                  }
                }
              }
            },
            ...errorResponses
          }
        }
      },
      '/values/{field}': {
        parameters: [{
          in: 'path',
          name: 'field',
          description: 'La colonne pour laquelle récupérer les valeurs distinctes.',
          required: true,
          schema: {
            title: 'Colonne',
            type: 'string',
            enum: valuesProperties.length ? valuesProperties.map((p: any) => p.key) : undefined
          }
        }],
        get: {
          summary: 'Lister les valeurs distinctes',
          description: "Récupérer la liste des valeurs distinctes d'une colonne.",
          operationId: 'getValues',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'size',
            description: 'Le nombre de résultats à retourner (taille de la pagination). 10 par défaut.',
            schema: {
              title: 'Taille de la pagination',
              default: 10,
              type: 'integer',
              maximum: 10000
            }
          }, {
            in: 'query',
            name: 'sort',
            description: 'Tri des valeurs ("**asc**" ou "**desc**").',
            schema: {
              title: 'Ordre de tri',
              type: 'string',
              default: 'asc',
              oneOf: [
                { const: 'asc', title: 'Ascendant' },
                { const: 'desc', title: 'Descendant' }
              ]
            }
          },
          ...filterParams],
          responses: {
            200: {
              description: 'Les valeurs distinctes de la colonne.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              }
            },
            ...errorResponses
          }
        }
      },
      '/values-labels/{field}': {
        parameters: [{
          in: 'path',
          name: 'field',
          description: 'La colonne pour laquelle récupérer les valeurs avec leurs libellés.',
          required: true,
          schema: {
            title: 'Colonne',
            type: 'string',
            enum: valuesProperties.length ? valuesProperties.map((p: any) => p.key) : undefined
          }
        }],
        get: {
          summary: 'Lister les valeurs avec libellés',
          description: "Récupérer la liste des valeurs distinctes d'une colonne avec leurs libellés associés (`x-labels`). Utile pour des champs de type select/autocomplete.",
          operationId: 'getValuesLabels',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'size',
            description: 'Le nombre de résultats à retourner. 1000 par défaut.',
            schema: {
              title: 'Taille de la pagination',
              default: 1000,
              type: 'integer',
              maximum: 10000
            }
          },
          ...filterParams],
          responses: {
            200: {
              description: 'Les valeurs distinctes accompagnées de leurs libellés.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        value: { type: 'string' },
                        label: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
            ...errorResponses
          }
        }
      },
      '/values_agg': {
        get: {
          summary: 'Agréger les valeurs',
          description: 'Récupérer des informations agrégées en fonction des valeurs de colonnes.',
          operationId: 'getValuesAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: 'La ou les colonnes en fonction des valeurs desquelles grouper les lignes du jeu de données.',
            required: true,
            explode: false,
            schema: {
              title: 'Colonne(s) de groupement',
              type: 'array',
              items: {
                type: 'string',
                enum: valuesProperties.length ? valuesProperties.map((p: any) => p.key) : undefined
              }
            }
          }, {
            in: 'query',
            name: 'interval',
            description: `La manière de grouper les valeurs par niveau d'agrégation.

Pour grouper par valeur distincte utilisez "value" (comportement par défaut).

Si la colonne de groupement est de type date vous pouvez utiliser un intervalle de calendrier comme "year", "month", etc (<a href="https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-datehistogram-aggregation#calendar_intervals">voir la documentation Elasticsearch</a>).

Si la colonne est numérique vous pouvez saisir un nombre qui sera utilisé comme intervalle de groupement des valeurs.`,
            required: false,
            explode: false,
            schema: {
              title: 'Interval(s) de groupement',
              type: 'array',
              items: { type: 'string' }
            }
          }, htmlParam, {
            in: 'query',
            name: 'metric',
            description: `La métrique à appliquer par niveau de groupement :
  - \`avg\` : moyenne
  - \`sum\` : somme
  - \`min\` : valeur minimale
  - \`max\` : valeur maximale
  - \`value_count\` : nombre de valeurs
  - \`cardinality\` : nombre de valeurs distinctes (approximatif à partir de 40 000)
            `,
            explode: false,
            schema: {
              title: 'Métrique',
              type: 'string',
              enum: ['avg', 'sum', 'min', 'max', 'cardinality', 'value_count']
            }
          }, {
            in: 'query',
            name: 'metric_field',
            description: 'La colonne sur laquelle effectuer le calcul de métrique par niveau de groupement.',
            schema: {
              type: 'string',
              enum: schema.length ? schema.map((p: any) => p.key) : undefined
            }
          }, {
            in: 'query',
            name: 'missing',
            description: 'Nom du groupe des lignes pour lesquelles la colonne de groupement est vide.',
            explode: false,
            schema: {
              title: 'Groupe des valeurs manquantes',
              type: 'array',
              items: { type: 'string' }
            }
          }, {
            in: 'query',
            name: 'agg_size',
            description: 'Le nombre de groupes par niveau de groupement.',
            explode: false,
            schema: {
              type: 'array',
              items: {
                default: 20,
                type: 'integer',
                maximum: 10000
              }
            }
          },
          ...hitsParams(0, 100, 'values_agg'),
          ...filterParams],
          responses: {
            200: {
              description: "Les informations du jeu de données agrégées par valeurs d'une colonne.",
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...errorResponses
          }
        }
      },
      '/metric_agg': {
        get: {
          summary: 'Calculer une métrique',
          description: 'Calculer une métrique sur une colonne.',
          operationId: 'getMetricAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [
            {
              in: 'query',
              name: 'metric',
              description: 'La métrique à calculer.',
              required: true,
              schema: {
                title: 'Métrique à calculer',
                type: 'string',
                enum: acceptedMetricAggs
              }
            },
            {
              in: 'query',
              name: 'field',
              description: 'La colonne sur laquelle calculer la métrique.',
              schema: {
                title: 'Colonne pour le calcul de métrique',
                type: 'string',
                enum: valuesProperties.length ? schema.map((p: any) => p.key) : undefined
              },
              required: true
            },
            {
              in: 'query',
              name: 'percents',
              description: 'Les pourcentages sur lesquels calculer la métrique percentiles (inutile pour les autres métriques).',
              required: false,
              schema: {
                title: 'Pourcentages sur lesquels calculer la métrique percentiles',
                type: 'string',
                default: '1,5,25,50,75,95,99'
              }
            },
            ...filterParams
          ],
          responses: {
            200: {
              description: 'Le résultat du calcul.',
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...errorResponses
          }
        }
      },
      '/simple_metrics_agg': {
        get: {
          summary: 'Calculer des métriques simples',
          description: 'Calculer des métriques simples standards sur toutes les colonnes possibles ou sur une liste de colonnes.',
          operationId: 'getSimpleMetricsAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [
            {
              in: 'query',
              name: 'metrics',
              description: 'Les métriques à appliquer. Des métriques par défaut sont appliquées en fonction du type de champ.',
              schema: {
                title: 'Métriques à appliquer',
                type: 'array',
                items: { type: 'string', enum: acceptedMetricAggs }
              }
            },
            {
              in: 'query',
              name: 'fields',
              description: 'Les colonnes sur lesquelles calculer les métriques.',
              schema: {
                title: 'Colonnes sur lesquelles calculer les métriques',
                type: 'array',
                items: {
                  type: 'string',
                  enum: valuesProperties.length ? schema.map((p: any) => p.key) : undefined
                }
              },
              style: 'form',
              explode: false
            },
            ...filterParams
          ],
          responses: {
            200: {
              description: 'Le résultat du calcul.',
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...errorResponses
          }
        }
      },
      '/words_agg': {
        get: {
          summary: 'Lister les mots significatifs',
          description: "Récupérer des mots significatifs d'une colonne dans un jeu de données.",
          operationId: 'getWordsAgg',
          'x-permissionClass': 'read',
          tags: ['Données'],
          parameters: [{
            in: 'query',
            name: 'field',
            description: "La colonne sur laquelle effectuer l'analyse.",
            required: true,
            schema: {
              title: "Colonne pour l'analyse",
              type: 'string',
              enum: textAggProperties.length ? textAggProperties.map((p: any) => p.key) : undefined
            }
          }, {
            in: 'query',
            name: 'analysis',
            description: "Le type d'analyse textuelle effectuée sur la colonne.\n\nL'analyse \"**lang**\" est intelligente en fonction de la langue, elle calcule la racine grammaticale des mots et ignore les mots les moins significatifs.\n\nL'analyse \"**standard**\" effectue un travail plus basique d'extraction de mots bruts depuis le texte.",
            schema: {
              title: "Type d'analyse à effectuer",
              type: 'string',
              default: 'lang',
              enum: ['lang', 'standard']
            }
          },
          ...filterParams],
          responses: {
            200: {
              description: "Le résultat de l'analyse.",
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...errorResponses
          }
        }
      },
      '/raw': {
        get: {
          summary: 'Télécharger',
          description: "Télécharger le jeu de données dans son format d'origine.",
          operationId: 'downloadOriginalData',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le fichier de données.',
              content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/convert': {
        get: {
          summary: 'Télécharger (format converti)',
          description: 'Télécharger le jeu de données après conversion automatique vers un format standard (CSV typiquement).',
          operationId: 'downloadConvertedData',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le fichier de données converti.',
              content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/full': {
        get: {
          summary: 'Télécharger (données enrichies)',
          description: 'Télécharger le jeu de données enrichi avec les colonnes calculées et les extensions.',
          operationId: 'downloadFullData',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le fichier de données enrichi.',
              content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/data-files': {
        get: {
          summary: 'Lister les fichiers',
          description: 'Récupérer la liste des fichiers de données disponibles (original, converti, enrichi, etc.).',
          operationId: 'listDataFiles',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'La liste des fichiers de données.',
              content: {
                'application/json': { schema: dataFiles }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/data-files/{filePath}': {
        parameters: [{
          in: 'path',
          name: 'filePath',
          description: 'Chemin relatif du fichier de données.',
          required: true,
          schema: {
            title: 'Chemin du fichier',
            type: 'string'
          }
        }],
        get: {
          summary: 'Télécharger un fichier',
          description: 'Télécharger un fichier de données spécifique.',
          operationId: 'downloadDataFile',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le fichier de données.',
              content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
              }
            },
            ...readErrorResponses
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
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation publique au format OpenAPI v3.',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: "La documentation publique de l'API.",
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/thumbnail': {
        get: {
          summary: 'Récupérer la vignette',
          description: "Récupérer la vignette de l'image de couverture du jeu de données, redimensionnée pour servir d'aperçu.",
          operationId: 'readThumbnail',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'La vignette du jeu de données.',
              content: { 'image/*': {} }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: textPlainResponse("Le jeu de données n'existe pas ou ne possède pas d'image associée.")
          }
        }
      },
      '/attachments/{attachmentId}': {
        parameters: [{
          in: 'path',
          name: 'attachmentId',
          description: 'Identifiant (chemin relatif) de la pièce jointe de données.',
          required: true,
          schema: {
            title: 'Identifiant de la pièce jointe',
            type: 'string'
          }
        }],
        get: {
          summary: 'Télécharger une pièce jointe',
          description: 'Télécharger une pièce jointe de données référencée par une colonne de type *DigitalDocument*.',
          operationId: 'downloadAttachment',
          'x-permissionClass': 'read',
          tags: ['Données'],
          responses: {
            200: {
              description: 'Le fichier de la pièce jointe.'
            },
            ...readErrorResponses
          }
        }
      },
      ...masterData.endpoints(dataset)
    },
    externalDocs: {
      description: 'Documentation sur GitHub',
      url: 'https://data-fair.github.io/master/'
    }
  }

  if ((dataset as any).isVirtual || (dataset as any).isRest || (dataset as any).isMetaOnly) {
    delete api.paths['/raw']
    delete api.paths['/convert']
    delete api.paths['/full']
    delete api.paths['/data-files']
    delete api.paths['/data-files/{filePath}']
  }

  if ((dataset as any).isMetaOnly) {
    delete api.paths['/lines']
    delete api.paths['/schema']
    delete api.paths['/safe-schema']
    delete api.paths['/words_agg']
    delete api.paths['/metric_agg']
    delete api.paths['/values/{field}']
    delete api.paths['/values-labels/{field}']
    delete api.paths['/values_agg']
  }

  if (textAggProperties.length === 0) {
    delete api.paths['/words_agg']
  }
  if (valuesProperties.length === 0) {
    delete api.paths['/values_agg']
    delete api.paths['/values/{field}']
    delete api.paths['/values-labels/{field}']
    delete api.paths['/metric_agg']
    delete api.paths['/simple_metrics_agg']
  }
  if (!documentProperty) {
    delete api.paths['/attachments/{attachmentId}']
  }

  if (hasBbox) {
    api.paths['/geo_agg'] = {
      get: {
        summary: 'Agréger spatialement',
        description: 'Récupérer des informations agrégées spatialement sur le jeu de données.',
        operationId: 'getGeoAgg',
        'x-permissionClass': 'read',
        tags: ['Données'],
        parameters: [aggSizeParam, ...hitsParams(0, 100), formatParam, htmlParam, ...filterParams],
        responses: {
          200: {
            description: 'Les informations du jeu de données agrégées spatialement.',
            content: {
              'application/json': { schema: { type: 'object' } }
            }
          },
          ...errorResponses
        }
      }
    }
  }

  if ((dataset as any).rest && (dataset as any).rest.history) {
    const size = hitsParams().find((p: any) => p.name === 'size')
    const before = {
      in: 'query',
      name: 'before',
      description: "Pagination pour remonter dans l'historique.\n\n*Automatiquement renseigné par la propriété **next** du résultat de la requête précédente.*",
      schema: {
        title: "Pagination pour remonter dans l'historique",
        default: 1,
        type: 'integer'
      }
    }
    const revisionsResponses = {
      200: {
        description: 'Les révisions.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  description: 'Le nombre total de résultat si on ignore la pagination.'
                },
                results: {
                  type: 'array',
                  items: bulkLineSchema
                },
                next: {
                  type: 'string',
                  description: 'URL pour continuer la pagination.'
                }
              }
            }
          }
        }
      },
      ...readErrorResponses
    }
    api.paths['/revisions'] = {
      get: {
        summary: 'Récupérer les révisions',
        description: 'Récupérer les révisions de lignes triées du plus récent au plus ancien.',
        operationId: 'readRevisions',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        parameters: [size, before],
        responses: revisionsResponses
      }
    }
    api.paths['/lines/{lineId}/revisions'] = {
      parameters: [{
        in: 'path',
        name: 'lineId',
        description: 'Identifiant de la ligne.',
        required: true,
        schema: {
          title: 'Identifiant de la ligne',
          type: 'string'
        }
      }],
      get: {
        summary: "Récupérer les révisions d'une ligne",
        description: "Récupérer les révisions d'une ligne triées du plus récent au plus ancien.",
        operationId: 'readLineRevisions',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        parameters: [size, before],
        responses: revisionsResponses
      }
    }
  }

  if (settings?.compatODS) {
    api.paths['/compat-ods/records'] = {
      get: {
        summary: 'Récupérer les enregistrements',
        description: '**AVERTISSEMENT** : Cette opération est un prototype en cours de conception. Elle permettra de récupérer les enregistrements du jeu de données de manière identique à l\'API "/records" du portail précédent.',
        operationId: 'readCompatODSRecords',
        'x-permissionClass': 'read',
        tags: ['Rétrocompatibilité'],
        deprecated: true,
        parameters: [
          { in: 'query', name: 'select', schema: { type: 'string' } },
          { in: 'query', name: 'where', schema: { type: 'string' } },
          { in: 'query', name: 'group_by', schema: { type: 'string' } },
          { in: 'query', name: 'order_by', schema: { type: 'string' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
          { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } }
        ],
        responses: {
          200: {
            description: 'Les enregistrements.',
            content: {
              'application/json': { schema: { type: 'object' } }
            }
          },
          ...errorResponses
        }
      }
    }

    api.paths['/compat-ods/exports/{format}'] = {
      parameters: [{
        in: 'path',
        name: 'format',
        required: true,
        schema: {
          type: 'string',
          enum: ['csv', 'xlsx', 'parquet', 'json', 'jsonl', 'geojson']
        }
      }],
      get: {
        summary: 'Exporter les données',
        description: '**AVERTISSEMENT** : Cette opération est un prototype en cours de conception. Elle permettra d\'exporter le contenu du jeu de données de manière identique à l\'API "/exports" du portail précédent.',
        operationId: 'readCompatODSExports',
        'x-permissionClass': 'read',
        tags: ['Rétrocompatibilité'],
        deprecated: true,
        parameters: [
          { in: 'query', name: 'select', schema: { type: 'string' } },
          { in: 'query', name: 'where', schema: { type: 'string' } },
          { in: 'query', name: 'order_by', schema: { type: 'string' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: {
            description: 'Les enregistrements exportés.',
            content: {
              'application/json': { schema: { type: 'object' } }
            }
          },
          ...errorResponses
        }
      }
    }
  }

  // Drives the navigation drawer order in the openapi-viewer. Only tags that are
  // actually used by at least one operation are listed.
  const usedTags = new Set<string>()
  for (const methods of Object.values(api.paths) as any[]) {
    for (const [m, op] of Object.entries(methods)) {
      if (m === 'parameters') continue
      const tags = (op as any)?.tags
      if (Array.isArray(tags)) for (const t of tags) usedTags.add(t)
    }
  }
  const tagOrder = [
    'Métadonnées',
    'Données',
    'Données de référence',
    'Rétrocompatibilité'
  ]
  api.tags = tagOrder.filter(t => usedTags.has(t)).map(name => ({ name }))

  return { api, userApiRate, anonymousApiRate, bulkLineSchema }
}
