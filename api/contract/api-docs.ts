import config from '#config'
import { resolvedSchema as dataset } from '#types/dataset/index.ts'
import { resolvedSchema as datasetPost } from '../doc/datasets/post-req/index.js'
import { resolvedSchema as datasetPatch } from '../doc/datasets/patch-req/index.js'
import { resolvedSchema as application } from '../types/application/.type/index.js'
import { resolvedSchema as applicationPatchReq } from '../doc/applications/patch-req/.type/index.js'
import privateDatasetAPIDocs from './dataset-private-api-docs.ts'
import * as utils from './utils.js'
import pJson from './p-json.js'

const datasetIdParam = {
  in: 'path',
  name: 'id',
  description: "Identifiant du jeu de données. L'identifiant de publication (`slug`) fonctionne aussi lorsque l'API est appelée depuis un portail.",
  required: true,
  schema: { type: 'string', title: 'Identifiant du jeu de données' }
}

const applicationIdParam = {
  in: 'path',
  name: 'id',
  description: "Identifiant de l'application. L'identifiant de publication (`slug`) fonctionne aussi lorsque l'API est appelée depuis un portail.",
  required: true,
  schema: { type: 'string', title: "Identifiant de l'application" }
}

/** Wraps a description into a text/plain OpenAPI response object. */
const textPlainResponse = (description: string) => ({
  description,
  content: {
    'text/plain': { schema: { type: 'string' } }
  }
})

// Reusable error response refs for top-level routes.
const readErrorResponses = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' }
}
const errorResponses = {
  400: { $ref: '#/components/responses/BadRequest' },
  ...readErrorResponses
}

/**
 * Builds the merged root OpenAPI documentation served at /api-docs.json.
 * Combines top-level CRUD (datasets, applications) with the per-dataset routes built by
 * `privateDatasetAPIDocs` in `merged` mode, which produces every possible dataset route
 * with tags already prefixed for the merged drawer.
 */
export default (publicUrl: string = config.publicUrl) => {
  const api: any = {
    openapi: '3.1.0',
    info: {
      title: 'API Data Fair',
      description: `
Cette documentation interactive à destination des développeurs permet de gérer les ressources de ce service de publication de données et de consommer les opérations applicables aux jeux de données (toutes variantes confondues : fichier, éditable, virtuel, métadonnées seules, master data), incluant les opérations privées et d'administration.

Les opérations réellement exposées pour un jeu de données particulier dépendent de son type et de sa configuration. Pour un jeu de données précis, sa propre documentation reste accessible via \`/datasets/{id}/api-docs.json\` (publique) ou \`/datasets/{id}/private-api-docs.json\` (privée).

Les opérations spécifiques à une application particulière (configuration, journal, pièces jointes, etc.) ainsi que les services distants disposent chacune de leur propre documentation séparée.

Pour utiliser cette API dans un programme vous aurez besoin d'une clé que vous pouvez créer dans vos paramètres personnels ou dans les paramètres d'une organisation dont vous êtes administrateur.

Pour des exemples simples de publication de données vous pouvez consulter la <a href="https://data-fair.github.io/4/interoperate/api" target="_blank">documentation sur ce sujet</a>.
`,
      version: pJson.version,
      'x-api-id': 'data-fair',
      ...config.info
    },
    servers: [{
      url: `${publicUrl}/api/v1`,
      description: `Instance Data Fair - ${new URL(publicUrl).hostname}`
    }],
    components: {
      schemas: {
        dataset,
        datasetPatch: datasetPatch.properties.body,
        datasetPost: datasetPost.properties.body,
        application,
        applicationPatch: applicationPatchReq.properties.body,
      },
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
      responses: {
        BadRequest: textPlainResponse('Requête invalide : corps de requête mal formé, paramètres manquants ou contraintes métier non respectées.'),
        Unauthorized: textPlainResponse("Non authentifié : aucune session ni clé d'API valide n'a été fournie."),
        Forbidden: textPlainResponse('Permissions insuffisantes pour effectuer cette opération.'),
        NotFound: textPlainResponse("La ressource demandée n'existe pas.")
      }
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    paths: {
      '/ping': {
        get: {
          summary: "Obtenir l'état de santé du service",
          description: 'Vérifier que le service est opérationnel.',
          operationId: 'ping',
          tags: ['Administration'],
          'x-operationType': 'http://schema.org/CheckAction',
          responses: {
            200: textPlainResponse('Service ok.'),
            500: textPlainResponse('Service ko.')
          }
        }
      },
      '/api-docs.json': {
        get: {
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation au format OpenAPI v3.',
          operationId: 'getApiDoc',
          tags: ['Administration'],
          responses: {
            200: {
              description: "La documentation de l'API.",
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            }
          }
        }
      },
      '/vocabulary': {
        get: {
          summary: 'Lister les concepts',
          description: 'Récupérer la liste des concepts utilisables pour annoter la donnée sur ce service.',
          operationId: 'getVocabulary',
          tags: ['Administration'],
          responses: {
            200: {
              description: 'La liste des concepts.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        identifiers: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        type: { type: 'string' },
                        tag: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/datasets': {
        get: {
          summary: 'Lister les jeux de données',
          description: 'Récupérer la liste des jeux de données.',
          operationId: 'listDatasets',
          tags: ['Jeux de données (JDD)'],
          parameters: [
            utils.qParam,
            ...utils.ownerParams,
            utils.booleanParam('raw', 'Ne pas inclure les champs calculés'),
            utils.selectParam(Object.keys(dataset.properties)),
            utils.filterParam('ids', 'Identifiants de jeux de données', 'Restreindre sur un ou plusieurs identifiants de jeux de données.'),
            utils.filterParam('filename', 'Restreindre sur les noms de fichier'),
            utils.filterParam('concepts', 'Identifiants de concepts', 'Restreindre les jeux de données sur un ou plusieurs identifiants de concepts.'),
            utils.filterParam('topics', 'Identifiants de thématiques', 'Restreindre les jeux de données sur un ou plusieurs identifiants de thématiques.'),
            utils.filterParam('field-type', 'Restreindre sur les types de colonnes'),
            utils.filterParam('field-format', 'Restreindre sur les formats des colonnes textes'),
            utils.booleanParam('file', 'Restreindre aux jeux avec fichiers attachés'),
            utils.booleanParam('rest', 'Restreindre aux jeux éditables'),
            utils.booleanParam('bbox', 'Restreindre aux jeux géographiques'),
            utils.booleanParam('queryable', 'Restreindre aux jeux requêtables et utilisables dans des applications'),
            ...utils.paginationParams,
            ...utils.visibilityParams
          ],
          responses: {
            200: {
              description: "Liste des jeux de données que l'utilisateur est autorisé à voir.",
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: {
                        type: 'number',
                        description: 'Nombre total de jeux de données.'
                      },
                      results: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/dataset' }
                      }
                    }
                  }
                }
              }
            },
            ...errorResponses
          }
        },
        post: {
          summary: 'Créer un jeu de données',
          description: 'Créer un nouveau jeu de données.',
          operationId: 'postDataset',
          tags: ['Jeux de données (JDD)'],
          requestBody: {
            description: 'Fichier à charger et autres informations.',
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/datasetPost' }
              }
            }
          },
          responses: {
            201: {
              description: 'Le jeu de données créé.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/dataset' }
                }
              }
            },
            ...errorResponses,
            413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
          }
        }
      },
      '/datasets/{id}': {
        parameters: [datasetIdParam],
        put: {
          summary: 'Créer ou mettre à jour un jeu de données',
          description: 'Créer ou mettre à jour un jeu de données en spécifiant son identifiant.',
          operationId: 'putDataset',
          tags: ['JDD / Métadonnées'],
          requestBody: {
            description: 'Fichier à charger et autres informations.',
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/datasetPost' }
              }
            }
          },
          responses: {
            201: {
              description: 'Jeu de données créé.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/dataset' }
                }
              }
            },
            200: {
              description: 'Jeu de données modifié.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/dataset' }
                }
              }
            },
            ...errorResponses,
            413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
          }
        }
      },
      '/applications': {
        get: {
          summary: 'Lister les applications',
          description: 'Récupérer la liste des applications.',
          operationId: 'listApplications',
          tags: ['Applications'],
          parameters: [
            utils.qParam,
            ...utils.ownerParams,
            utils.booleanParam('raw', 'Ne pas inclure les champs calculés'),
            utils.selectParam(Object.keys(application.properties)),
            utils.filterParam('ids', 'Restreindre sur les identifiants'),
            utils.filterParam('dataset', 'Restreindre sur les jeux de données utilisés'),
            utils.filterParam('service', 'Restreindre sur les services distants utilisés'),
            ...utils.paginationParams,
            ...utils.visibilityParams
          ],
          responses: {
            200: {
              description: "Liste des applications que l'utilisateur est autorisé à voir.",
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: {
                        type: 'number',
                        description: "Nombre total d'applications."
                      },
                      results: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/application' }
                      }
                    }
                  }
                }
              }
            },
            ...errorResponses
          }
        },
        post: {
          summary: 'Configurer une application',
          description: 'Créer une nouvelle application.',
          operationId: 'postApplication',
          tags: ['Applications'],
          requestBody: {
            description: "Les informations de configuration de l'application.",
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/application' }
              }
            }
          },
          responses: {
            201: {
              description: "Les informations de configuration de l'application.",
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...errorResponses
          }
        }
      },
      '/applications/{id}': {
        parameters: [applicationIdParam],
        get: {
          summary: "Lire les informations d'une application",
          description: "Récupérer les informations d'une application.",
          operationId: 'getApplication',
          tags: ['Applications'],
          responses: {
            200: {
              description: "Informations d'une application.",
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...readErrorResponses
          }
        },
        put: {
          summary: 'Créer ou mettre à jour une application',
          description: 'Créer ou mettre à jour une application en spécifiant son identifiant.',
          operationId: 'putApplication',
          tags: ['Applications'],
          requestBody: {
            description: "Informations de l'application.",
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/application' }
              }
            }
          },
          responses: {
            201: {
              description: 'Application créée.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            200: {
              description: 'Application modifiée.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...errorResponses
          }
        },
        patch: {
          summary: 'Modifier une application',
          description: "Modifier seulement certaines informations d'une application.",
          operationId: 'patchApplication',
          tags: ['Applications'],
          requestBody: {
            description: 'Informations à modifier.',
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/applicationPatch' }
              }
            }
          },
          responses: {
            200: {
              description: "Informations de l'application modifiée.",
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...errorResponses
          }
        },
        delete: {
          summary: 'Supprimer une application',
          description: 'Supprimer cette application.',
          operationId: 'deleteApplication',
          tags: ['Applications'],
          responses: {
            204: {
              description: 'Application supprimée.'
            },
            ...readErrorResponses
          }
        }
      },
    },
    externalDocs: {
      description: 'Documentation sur GitHub',
      url: 'https://data-fair.github.io/master/'
    }
  }

  // Build all dataset routes in one shot. The merged-mode private doc:
  // — uses an internal sample dataset with every feature enabled (file + isRest + history + masterData + bbox + ...)
  // — skips variant pruning so /raw, /lines, /revisions, /master-data/*, /geo_agg, etc. all coexist
  // — bypasses session-based admin gating
  // — remaps tags to "JDD / ..." so they slot directly into this doc's drawer
  const datasetApi = privateDatasetAPIDocs(undefined, publicUrl, undefined, undefined, { merged: true })

  for (const [path, methods] of Object.entries(datasetApi.paths) as [string, any][]) {
    const cleanedPath = path === '/' ? '' : path
    const fullPath = `/datasets/{id}${cleanedPath}`

    if (!api.paths[fullPath]) api.paths[fullPath] = { parameters: [datasetIdParam] }
    api.paths[fullPath].parameters = api.paths[fullPath].parameters || [datasetIdParam]
    for (const param of methods.parameters ?? []) {
      const exists = api.paths[fullPath].parameters.some((p: any) => p.in === param.in && p.name === param.name)
      if (!exists) api.paths[fullPath].parameters.push(param)
    }

    for (const [method, operation] of Object.entries(methods) as [string, any][]) {
      if (method === 'parameters') continue
      const existing = api.paths[fullPath][method]
      if (existing) {
        const existingTags: string[] = Array.isArray(existing.tags) ? existing.tags : []
        const incomingTags: string[] = Array.isArray(operation.tags) ? operation.tags : []
        existing.tags = Array.from(new Set([...existingTags, ...incomingTags]))
      } else {
        api.paths[fullPath][method] = operation
      }
    }
  }

  // Explicit tag order — drives the navigation drawer order in the openapi-viewer.
  // Only tags that are actually used by at least one operation are listed.
  const usedTags = new Set<string>(
    Object.values(api.paths)
      .flatMap((methods: any) => Object.values(methods))
      .flatMap((op: any) => op?.tags || [])
  )
  const tagOrder = [
    'Administration',
    'Jeux de données (JDD)',
    'JDD / Métadonnées',
    'JDD / Données',
    'JDD / Éditable',
    'JDD / Rétrocompatibilité',
    'JDD / Administration',
    'Applications'
  ]
  api.tags = tagOrder.filter(t => usedTags.has(t)).map(name => ({ name }))

  return api
}
