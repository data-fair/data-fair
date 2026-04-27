import type { SessionStateAuthenticated } from '@data-fair/lib-express'
import type { Dataset, Settings } from '#types'

import _config from 'config'
import datasetAPIDocs from './dataset-api-docs.ts'
import { resolvedSchema as datasetPost } from '../doc/datasets/post-req/index.js'
import { resolvedSchema as datasetPatch } from '../doc/datasets/patch-req/index.js'
import journalSchema from './journal.js'
import { visibility } from '../src/misc/utils/visibility.js'
import { apiDoc as permissionsDoc } from '../src/misc/utils/permissions.ts'
import * as datasetUtils from '../src/datasets/utils/index.js'

type DatasetApiDocsSettings = (Pick<Settings, 'info' | 'compatODS'> & Record<string, any>) | null | undefined

const config = _config as any

/** Wraps a description into a text/plain OpenAPI response object. */
const textPlainResponse = (description: string) => ({
  description,
  content: {
    'text/plain': { schema: { type: 'string' } }
  }
})

/**
 * Builds the private per-dataset OpenAPI documentation served at /datasets/{id}/private-api-docs.json.
 * Extends the public doc with write/admin operations and routes gated by the user's session (admin mode, etc).
 */
export default (dataset: Dataset, publicUrl: string = config.publicUrl, sessionState: SessionStateAuthenticated, settings?: DatasetApiDocsSettings) => {
  const { api, userApiRate, anonymousApiRate, bulkLineSchema } = datasetAPIDocs(dataset, publicUrl, settings)

  const title = `API privée du jeu de données : ${dataset.title || dataset.id}`

  let description = `
Cette documentation interactive à destination des développeurs permet de gérer et consommer les ressources du jeu de données "**${dataset.title || dataset.id}**".
`

  if (dataset.isVirtual) {
    description += `
Ce jeu de données est virtuel. Cela signifie qu'il est constitué de redirections vers un ensemble de jeux de données et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
  }

  if (dataset.isRest) {
    description += `
Ce jeu de données est éditable. Cela signifie qu'il est constitué dynamiquement à partir de lectures / écritures de lignes et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
  }

  description += `
Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :

- ${userApiRate}
`

  if (visibility(dataset) !== 'public') {
    description += `
Pour utiliser cette API dans un programme vous aurez besoin d'une clé que vous pouvez créer dans les paramètres du compte.
`
  } else {
    description += `
- ${anonymousApiRate}
`
  }

  api.components.securitySchemes = {
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
  }
  api.security = [{ apiKey: [] }, { sdCookie: [] }]

  Object.assign(api.info, { title, description })

  // Standard error responses ($refs to components.responses defined in the public doc).
  const readErrorResponses = {
    401: { $ref: '#/components/responses/Unauthorized' },
    403: { $ref: '#/components/responses/Forbidden' },
    404: { $ref: '#/components/responses/NotFound' }
  }
  const errorResponses = {
    400: { $ref: '#/components/responses/BadRequest' },
    ...readErrorResponses
  }
  const writeErrorResponses = {
    ...errorResponses,
    409: textPlainResponse('Conflit : le jeu de données est verrouillé ou se trouve dans un état incompatible avec cette opération.')
  }

  Object.assign(api.paths['/'], {
    patch: {
      summary: 'Modifier le jeu de données',
      description: 'Mettre à jour les informations du jeu de données.',
      operationId: 'writeDescription',
      'x-permissionClass': 'write',
      'x-altPermissions': [
        { id: 'writeDescriptionBreaking', class: 'write', title: 'Mettre à jour les informations du jeu de données qui peuvent déclencher une rupture de compatibilité' }
      ],
      tags: ['Métadonnées'],
      requestBody: {
        description: 'Les informations à modifier sur le jeu de données.',
        required: true,
        content: {
          'application/json': {
            schema: datasetPatch.properties.body
          }
        }
      },
      responses: {
        200: {
          description: 'Le jeu de données mis à jour.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/dataset' }
            }
          }
        },
        ...errorResponses
      }
    },
    delete: {
      summary: 'Supprimer le jeu de données',
      description: 'Supprimer ce jeu de données.',
      operationId: 'delete',
      'x-permissionClass': 'admin',
      tags: ['Métadonnées'],
      responses: {
        204: {
          description: 'Jeu de données supprimé.'
        },
        ...readErrorResponses
      }
    }
  })

  if (dataset.file) {
    api.paths['/'].post = {
      summary: 'Mettre à jour les données',
      description: 'Mettre à jour le fichier de données du jeu de données. La nouvelle version est créée en brouillon, à valider via la route `validateDraft`.',
      operationId: 'writeData',
      'x-permissionClass': 'write',
      tags: ['Données'],
      requestBody: {
        description: 'Le fichier à charger et autres informations.',
        required: true,
        content: {
          'multipart/form-data': {
            schema: datasetPost.properties.body
          }
        }
      },
      responses: {
        200: {
          description: 'Le jeu de données après mise à jour.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/dataset' }
            }
          }
        },
        ...writeErrorResponses,
        413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
      }
    }
  }

  api.paths['/private-api-docs.json'] = {
    get: {
      summary: 'Obtenir la documentation privée OpenAPI',
      description: 'Accéder à cette documentation privée au format OpenAPI v3.',
      operationId: 'readPrivateApiDoc',
      'x-permissionClass': 'readAdvanced',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: "La documentation privée de l'API.",
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },
        ...readErrorResponses
      }
    }
  }

  api.paths['/metadata-attachments'] = {
    post: {
      summary: 'Charger une pièce jointe',
      description: "Charger une pièce jointe dans les métadonnées.\n\n**Attention** : il faut ensuite ajouter la pièce jointe aux informations du jeu de données via la route `writeDescription` pour qu'elle soit répertoriée.",
      operationId: 'postMetadataAttachment',
      'x-permissionClass': 'write',
      tags: ['Métadonnées'],
      requestBody: {
        description: 'La pièce jointe à charger.',
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                attachment: {
                  type: 'string',
                  format: 'binary'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'La pièce jointe a correctement été chargée.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mimetype: { type: 'string' },
                  name: { type: 'string' },
                  size: { type: 'integer' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        ...errorResponses,
        413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
      }
    }
  }

  api.paths['/metadata-attachments/{attachmentId}'] = {
    parameters: [{
      in: 'path',
      name: 'attachmentId',
      description: 'Identifiant (chemin relatif) de la pièce jointe.',
      required: true,
      schema: {
        title: 'Identifiant de la pièce jointe',
        type: 'string'
      }
    }],
    get: {
      summary: 'Télécharger une pièce jointe',
      description: 'Télécharger une pièce jointe des métadonnées.',
      operationId: 'downloadMetadataAttachment',
      'x-permissionClass': 'read',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: 'Le fichier de la pièce jointe.'
        },
        ...readErrorResponses
      }
    },
    delete: {
      summary: 'Supprimer une pièce jointe',
      description: "Supprimer une pièce jointe des métadonnées.\n\n**Attention** : il faut ensuite supprimer la pièce jointe des informations du jeu de données via la route `writeDescription` pour qu'elle ne soit plus répertoriée.",
      operationId: 'deleteMetadataAttachment',
      'x-permissionClass': 'write',
      tags: ['Métadonnées'],
      responses: {
        204: {
          description: 'La pièce jointe a été supprimée.'
        },
        ...readErrorResponses
      }
    }
  }

  api.paths['/journal'] = {
    get: {
      summary: 'Lister les événements',
      description: 'Lister les événements du journal du jeu de données.',
      operationId: 'readJournal',
      'x-permissionClass': 'readAdvanced',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: "Le journal d'événements du jeu de données.",
          content: {
            'application/json': {
              schema: journalSchema
            }
          }
        },
        ...readErrorResponses
      }
    }
  }

  api.paths['/user-notification'] = {
    post: {
      summary: 'Envoyer une notification',
      description: 'Envoyer une notification relative au jeu de données à la visibilité interne au compte.',
      operationId: 'sendUserNotification',
      'x-permissionClass': 'write',
      'x-altPermissions': [{ id: 'sendUserNotificationPublic', class: 'write', title: 'Envoyer une notification relative au jeu de données à la visibilité externe au compte' }],
      tags: ['Métadonnées'],
      requestBody: {
        description: 'Le contenu de la notification.',
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      },
      responses: {
        200: {
          description: 'La notification envoyée.',
          content: {
            'application/json': { schema: { type: 'object' } }
          }
        },
        ...errorResponses
      }
    }
  }

  if (dataset.file) {
    api.paths['/draft'] = {
      post: {
        summary: 'Valider le brouillon',
        description: 'Valider la version brouillon du jeu de données pour la rendre courante.',
        operationId: 'validateDraft',
        'x-permissionClass': 'write',
        tags: ['Données'],
        responses: {
          200: {
            description: 'Le jeu de données après validation du brouillon.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/dataset' }
              }
            }
          },
          ...writeErrorResponses
        }
      },
      delete: {
        summary: 'Annuler le brouillon',
        description: 'Annuler la version brouillon du jeu de données et revenir à la version courante.',
        operationId: 'cancelDraft',
        'x-permissionClass': 'write',
        tags: ['Données'],
        responses: {
          200: {
            description: 'Le jeu de données après annulation du brouillon.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/dataset' }
              }
            }
          },
          ...writeErrorResponses
        }
      }
    }
  }

  if (dataset.isRest) {
    const schema = dataset.schema ?? []
    const readLineSchema = datasetUtils.jsonSchema(schema, publicUrl)
    const writeLineSchema = datasetUtils.jsonSchema(schema.filter((p: any) => !p['x-calculated'] && !p['x-extension']), publicUrl)
    const lineIdParam = {
      in: 'path',
      name: 'lineId',
      description: "L'identifiant de la ligne.",
      required: true,
      schema: {
        title: 'Identifiant de la ligne',
        type: 'string'
      }
    }
    api.paths['/lines/{lineId}'] = {
      parameters: [lineIdParam],
      get: {
        summary: 'Récupérer une ligne',
        description: 'Récupérer le contenu complet d\'une ligne par son identifiant.',
        operationId: 'readLine',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        responses: {
          200: {
            description: "Le contenu d'une ligne de données.",
            content: {
              'application/json': { schema: readLineSchema }
            }
          },
          ...readErrorResponses
        }
      },
      put: {
        summary: 'Remplacer une ligne',
        description: 'Remplacer entièrement le contenu d\'une ligne par son identifiant.',
        operationId: 'updateLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: "Le contenu d'une ligne de données.",
          required: true,
          content: {
            'application/json': { schema: writeLineSchema }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données modifiée.',
            content: {
              'application/json': { schema: readLineSchema }
            }
          },
          ...errorResponses,
          413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
        }
      },
      patch: {
        summary: 'Modifier une ligne',
        description: 'Modifier partiellement le contenu d\'une ligne par son identifiant.',
        operationId: 'patchLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: "Le contenu partiel d'une ligne de données.",
          required: true,
          content: {
            'application/json': { schema: writeLineSchema }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données après modification.',
            content: {
              'application/json': { schema: readLineSchema }
            }
          },
          ...errorResponses,
          413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
        }
      },
      delete: {
        summary: 'Supprimer une ligne',
        description: 'Supprimer une ligne par son identifiant.',
        operationId: 'deleteLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'La ligne de données a été supprimée.'
          },
          ...readErrorResponses
        }
      }
    }
    api.paths['/lines'] = {
      ...api.paths['/lines'],
      post: {
        summary: 'Ajouter une ligne',
        description: 'Ajouter une nouvelle ligne au jeu de données.',
        operationId: 'createLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: "Le contenu d'une ligne de données.",
          required: true,
          content: {
            'application/json': { schema: writeLineSchema }
          }
        },
        responses: {
          201: {
            description: 'La ligne de données ajoutée.',
            content: {
              'application/json': { schema: readLineSchema }
            }
          },
          ...errorResponses,
          413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
        }
      },
      delete: {
        summary: 'Supprimer toutes les lignes',
        description: 'Supprimer toutes les lignes du jeu de données.',
        operationId: 'deleteAllLines',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'Toutes les lignes de données ont été supprimées.'
          },
          ...readErrorResponses
        }
      }
    }
    api.paths['/_bulk_lines'] = {
      post: {
        summary: 'Effectuer des opérations en masse',
        description: 'Créer/modifier/supprimer de multiples lignes en une seule opération.',
        operationId: 'bulkLines',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Les opérations à appliquer.',
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: bulkLineSchema
              }
            },
            'application/x-ndjson': {
              schema: bulkLineSchema
            }
          }
        },
        responses: {
          200: {
            description: 'Le résultat des opérations.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    nbOk: { type: 'integer' },
                    nbNotModified: { type: 'integer' },
                    nbErrors: { type: 'integer' },
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          line: { type: 'integer' },
                          error: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          ...errorResponses,
          413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
        }
      }
    }

    if (dataset.rest?.lineOwnership) {
      const ownerParam = {
        in: 'path',
        name: 'owner',
        description: 'Le propriétaire des lignes.',
        required: true,
        schema: {
          title: 'Propriétaire des lignes',
          type: 'string'
        }
      }
      /** Clones a /lines path under /own/{owner} and rewrites permissions, summaries and tags to the line-ownership variant. */
      const convertOwnLineApiPath = (apiPath: string) => {
        if (!api.paths[apiPath]) return
        const targetPath = '/own/{owner}' + apiPath
        api.paths[targetPath] = JSON.parse(JSON.stringify(api.paths[apiPath]))
        api.paths[targetPath].parameters = [ownerParam, ...(api.paths[targetPath].parameters || [])]
        Object.values(api.paths[targetPath]).forEach((p: any) => {
          if (!p.operationId) return
          p['x-permissionClass'] = 'manageOwnLines'
          p.operationId = p.operationId.replace('Line', 'OwnLine')
          if (p.summary) p.summary += ' (par propriétaire)'
          if (p.description) {
            p.description += ' (restreint par propriétaire de ligne)'
          } else {
            p.description = 'Restreint par propriétaire de ligne'
          }
          p.tags = ['Données éditables par propriétaire de ligne']
        })
      }
      convertOwnLineApiPath('/lines')
      delete api.paths['/own/{owner}/lines'].delete
      convertOwnLineApiPath('/lines/{lineId}')
      convertOwnLineApiPath('/_bulk_lines')
      convertOwnLineApiPath('/revisions')
      convertOwnLineApiPath('/lines/{lineId}/revisions')
    }
  }

  api.paths['/permissions'] = permissionsDoc

  if (!dataset.isMetaOnly && sessionState.user.adminMode) {
    Object.assign(api.paths, {
      '/_diagnose': {
        get: {
          summary: 'Lire les informations techniques',
          description: 'Récupérer des informations techniques pour aider au diagnostic.',
          tags: ['Administration'],
          operationId: 'diagnose',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Informations techniques de diagnostic.',
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/_reindex': {
        post: {
          summary: 'Forcer la réindexation',
          description: 'Forcer la réindexation complète du jeu de données.',
          tags: ['Administration'],
          operationId: 'reindex',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Accusé de réception de la demande de réindexation.',
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/_refinalize': {
        post: {
          summary: 'Forcer la refinalisation',
          description: 'Forcer la refinalisation du jeu de données.',
          tags: ['Administration'],
          operationId: 'refinalize',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Accusé de réception de la demande de refinalisation.',
              content: {
                'application/json': { schema: { type: 'object' } }
              }
            },
            ...readErrorResponses
          }
        }
      }
    })
  }
  if (dataset.isRest && sessionState.user.adminMode) {
    api.paths['/_sync_attachments_lines'] = {
      post: {
        summary: 'Forcer la synchronisation',
        description: 'Re-synchroniser les lignes du jeu de données avec les pièces jointes présentes.',
        tags: ['Administration'],
        operationId: 'syncAttachmentsLines',
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'Accusé de réception de la demande de re-synchronisation.',
            content: {
              'application/json': { schema: { type: 'object' } }
            }
          },
          ...readErrorResponses
        }
      }
    }
  }
  if (!dataset.isMetaOnly && sessionState.user.adminMode) {
    api.paths['/_lock'] = {
      delete: {
        summary: 'Supprimer les locks',
        description: 'Supprimer tous les verrous (locks) actifs sur le jeu de données.',
        tags: ['Administration'],
        operationId: 'deleteLocks',
        'x-permissionClass': 'superadmin',
        responses: {
          204: {
            description: 'Les verrous ont été supprimés.'
          },
          ...readErrorResponses
        }
      }
    }
  }

  if (dataset.isMetaOnly) {
    delete api.paths['/'].post
  }

  if (dataset.readApiKey?.active) {
    api.paths['/read-api-key'] = {
      get: {
        summary: "Obtenir la clé d'API",
        description: "Récupérer la clé d'API de lecture configurée sur le jeu de données.",
        operationId: 'getReadApiKey',
        'x-permissionClass': 'read',
        tags: ['Métadonnées'],
        responses: {
          200: {
            description: "La clé d'API de lecture.",
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    current: { type: 'string' }
                  }
                }
              }
            }
          },
          ...readErrorResponses
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
    'Données éditables',
    'Données éditables par propriétaire de ligne',
    'Données de référence',
    'Permissions',
    'Rétrocompatibilité',
    'Administration'
  ]
  api.tags = tagOrder.filter(t => usedTags.has(t)).map(name => ({ name }))

  return api
}
