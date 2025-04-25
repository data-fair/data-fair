import config from 'config'
import datasetAPIDocs from './dataset-api-docs.js'
import datasetPost from '../doc/datasets/post-req/schema.js'
import datasetPatch from '../doc/datasets/patch-req/schema.js'
import journalSchema from './journal.js'
import { visibility } from '../src/misc/utils/visibility.js'
import * as permissionsDoc from '../src/misc/utils/permissions.js'
import * as datasetUtils from '../src/datasets/utils/index.js'

/**
 *
 * @param {any} dataset
 * @param {string} publicUrl
 * @param {any} user
 * @param {any} settings
 * @returns
 */
// @ts-ignore
export default (dataset, publicUrl = config.publicUrl, user, settings) => {
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
    }
  }
  api.security = [{ apiKey: [] }, { sdCookie: [] }]

  Object.assign(api.info, { title, description })
  api.info.description = description

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
        description: 'Fichier à charger et informations de propriété.',
        required: true,
        content: {
          'application/json': {
            schema: datasetPatch.properties.body
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
      summary: 'Mettre à jour les données',
      description: 'Mettre à jour les données du jeu de données.',
      operationId: 'writeData',
      'x-permissionClass': 'write',
      tags: ['Données'],
      requestBody: {
        description: 'Fichier à charger et autres informations.',
        required: true,
        content: {
          'multipart/form-data': {
            schema: datasetPost.properties.body
          }
        }
      },
      responses: {
        200: {
          description: 'Métadonnées sur le dataset modifié.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/datasetSchema' }
            }
          }
        }
      }
    },
    delete: {
      summary: 'Supprimer le jeu de données',
      operationId: 'delete',
      'x-permissionClass': 'admin',
      tags: ['Métadonnées'],
      responses: {
        204: {
          description: 'Suppression effectuée.'
        }
      }
    }
  })

  api.paths['/metadata-attachments'] = {
    post: {
      summary: 'Charger une pièce jointe',
      description: 'Charger une pièce jointe dans les métadonnées.\n**Attention, il faut ensuite ajouter la pièce jointe aux informations du jeu de données via la route <code>operationId: writeDescription</code> pour qu\'elle soit répertoriée.**',
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
                  updateAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    }
  }

  api.paths['/metadata-attachments/{attachmentId}'] = {
    delete: {
      summary: 'Supprimer une pièce jointe',
      description: 'Supprimer une pièce jointe des métadonnées.\n**Attention, il faut ensuite supprimer la pièce jointe des informations du jeu de données via la route <code>operationId: writeDescription</code> pour qu\'elle ne soit plus répertoriée.**',
      operationId: 'deleteMetadataAttachment',
      'x-permissionClass': 'write',
      tags: ['Métadonnées'],
      parameters: [{
        in: 'path',
        name: 'attachmentId',
        description: 'Identifiant de la pièce jointe.',
        required: true,
        schema: {
          title: 'Identifiant de la pièce jointe.',
          type: 'string'
        }
      }],
      responses: {
        204: {
          description: 'La pièce jointe a été supprimée.'
        }
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
          description: 'La documentation privée de l\'API.',
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

  api.paths['/journal'] = {
    get: {
      summary: 'Lister les événements',
      description: 'Lister les événements du journal du jeu de données.',
      operationId: 'readJournal',
      'x-permissionClass': 'readAdvanced',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: 'Le journal d\'événements du jeu de données',
          content: {
            'application/json': {
              schema: journalSchema
            }
          }
        }
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
        description: 'Contenu de la notification.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
            }
          }
        }
      }
    }
  }

  if (dataset.file) {
    api.paths['/draft'] = {
      post: {
        summary: 'Valider le brouillon',
        operationId: 'validateDraft',
        'x-permissionClass': 'write',
        tags: ['Données']
      },
      delete: {
        summary: 'Annuler le brouillon',
        operationId: 'cancelDraft',
        'x-permissionClass': 'write',
        tags: ['Données']
      }
    }
  }

  if (dataset.isRest) {
    const readLineSchema = datasetUtils.jsonSchema(dataset.schema, publicUrl)
    const writeLineSchema = datasetUtils.jsonSchema(dataset.schema.filter((/** @type {any} */p) => !p['x-calculated'] && !p['x-extension']), publicUrl)
    const patchLineSchema = writeLineSchema
    const lineId = {
      in: 'path',
      name: 'lineId',
      description: 'L\'identifiant de la ligne',
      required: true,
      schema: {
        title: 'Identifiant de la ligne',
        type: 'string'
      }
    }
    api.paths['/lines/{lineId}'] = {
      parameters: [lineId],
      get: {
        summary: 'Récupérer une ligne',
        operationId: 'readLine',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        responses: {
          200: {
            description: 'Le contenu d\'une ligne de données.',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      put: {
        summary: 'Remplacer une ligne',
        operationId: 'updateLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu d\'une ligne de données.',
          required: true,
          content: {
            'application/json': {
              schema: patchLineSchema
            }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données modifiée.',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      patch: {
        summary: 'Modifier une ligne',
        operationId: 'patchLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu partiel d\'une ligne de données.',
          required: true,
          content: {
            'application/json': {
              schema: patchLineSchema
            }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données après modification.',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      delete: {
        summary: 'Supprimer une ligne',
        operationId: 'deleteLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'La ligne de données a été supprimée.'
          }
        }
      }
    }
    api.paths['/lines'] = {
      ...api.paths['/lines'],
      post: {
        summary: 'Ajouter une ligne',
        operationId: 'createLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu d\'une ligne de données.',
          required: true,
          content: {
            'application/json': {
              schema: writeLineSchema
            }
          }
        },
        responses: {
          201: {
            description: 'La ligne de données ajoutée.',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      delete: {
        summary: 'Supprimer toutes les lignes',
        operationId: 'deleteAllLines',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'Toutes les lignes de données ont été supprimées.'
          }
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
          }
        }
      }
    }

    if (dataset.rest.lineOwnership) {
      const convertOwnLineApiPath = (/** @type {string} */apiPath) => {
        if (!api.paths[apiPath]) return
        api.paths['/own/{owner}' + apiPath] = JSON.parse(JSON.stringify(api.paths[apiPath]))
        api.paths['/own/{owner}' + apiPath].parameters = api.paths['/own/{owner}' + apiPath].parameters || []
        api.paths['/own/{owner}' + apiPath].parameters.push({
          in: 'path',
          name: 'owner',
          description: 'Le propriétaire des lignes',
          required: true,
          schema: {
            type: 'string'
          }
        })
        Object.values(api.paths['/own/{owner}' + apiPath]).forEach(p => {
          if (!p.operationId) return
          p['x-permissionClass'] = 'manageOwnLines'
          p.operationId = p.operationId.replace('Line', 'OwnLine')
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

  if (!dataset.isMetaOnly && user.adminMode) {
    Object.assign(api.paths, {
      '/_diagnose': {
        get: {
          summary: 'Lire les informations techniques',
          description: 'Récupérer des informations techniques.',
          tags: ['Administration'],
          operationId: 'diagnose',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Informations techniques de diagnostic.',
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
          tags: ['Administration'],
          operationId: 'reindex',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Accusé de réception de la demande de reindexation.',
              content: {
                'application/json': {}
              }
            }
          }
        }
      },
      '/_refinalize': {
        post: {
          summary: 'Forcer la re-finalisation',
          tags: ['Administration'],
          operationId: 'refinalize',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Accusé de réception de la demande de re-finalisation.',
              content: {
                'application/json': {}
              }
            }
          }
        }
      },
      '/_lock': {
        delete: {
          summary: 'Supprimer les locks',
          tags: ['Administration'],
          operationId: 'deleteLocks',
          'x-permissionClass': 'superadmin',
          responses: {
            204: {
              description: 'Accusé de réception de la demande de suppression des locks.'
            }
          }
        }
      }
    })
  }
  if (dataset.isRest && user.adminMode) {
    api.paths['/_sync_attachments_lines'] = {
      post: {
        summary: 'Forcer la synchronisation',
        description: 'Re-synchroniser les lignes du jeux de données avec les pièces jointes présentes.',
        tags: ['Administration'],
        operationId: 'syncAttachmentsLines',
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'Accusé de réception de la demande re-synchronisation.',
            content: {
              'application/json': {}
            }
          }
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
        summary: 'Obtenir la clé d\'API',
        description: 'Récupérer la clé API de lecture.',
        operationId: 'getReadApiKey',
        'x-permissionClass': 'read',
        tags: ['Métadonnées'],
        responses: {
          200: {
            description: 'La clé API de lecture.',
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
          }
        }
      }
    }
  }

  return api
}
