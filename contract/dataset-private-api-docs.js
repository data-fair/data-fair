const config = require('config')
const datasetAPIDocs = require('./dataset-api-docs')
const datasetPost = require('./dataset-post')
const journalSchema = require('./journal')
const { visibility } = require('../server/misc/utils/visibility')
const permissionsDoc = require('../server/misc/utils/permissions').apiDoc
const datasetUtils = require('../server/datasets/utils')
const datasetPatchSchema = require('./dataset-patch')

/**
 *
 * @param {any} dataset
 * @param {string} publicUrl
 * @param {any} user
 * @param {any} info
 * @returns
 */
// @ts-ignore
module.exports = (dataset, publicUrl = config.publicUrl, user, info) => {
  const { api, userApiRate, anonymousApiRate, bulkLineSchema } = datasetAPIDocs(dataset, publicUrl, info)

  const title = `API privée du jeu de données : ${dataset.title || dataset.id}`

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
Ce jeu de données est éditable. C'est à dire qu'il est constitué dynamiquement à partir de lectures / écritures de lignes et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
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
  api.info.description = description

  Object.assign(api.paths['/'], {
    patch: {
      summary: 'Mettre à jour les informations du jeu de données',
      operationId: 'writeDescription',
      'x-permissionClass': 'write',
      'x-altPermissions': [
        { id: 'writeDescriptionBreaking', class: 'write', title: 'Mettre à jour les informations du jeu de données qui peuvent déclencher une rupture de compatibilité' }
      ],
      tags: ['Métadonnées'],
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
          description: 'Les informations du jeu de données',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/datasetSchema' }
            }
          }
        }
      }
    },
    post: {
      summary: 'Mettre à jour les données du jeu de données',
      operationId: 'writeData',
      'x-permissionClass': 'write',
      tags: ['Données'],
      requestBody: {
        description: 'Fichier à charger et autres informations',
        required: true,
        content: {
          'multipart/form-data': {
            schema: datasetPost
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
      summary: 'Supprimer le jeu de données',
      operationId: 'delete',
      'x-permissionClass': 'admin',
      tags: ['Métadonnées'],
      responses: {
        204: {
          description: 'Suppression effectuée'
        }
      }
    }
  })

  api.paths['/metadata-attachments'] = {
    post: {
      summary: 'Charger une pièce jointe aux métadonnées',
      operationId: 'postMetadataAttachment',
      'x-permissionClass': 'write',
      tags: ['Métadonnées']
    }
  }

  api.paths['/metadata-attachments/{attachmentId}'] = {
    delete: {
      summary: 'Supprimer une pièce jointe aux métadonnées',
      operationId: 'deleteMetadataAttachment',
      'x-permissionClass': 'write',
      tags: ['Métadonnées'],
      parameters: [{
        in: 'path',
        name: 'attachmentId',
        description: 'Identifiant de la pièce jointe',
        required: true,
        schema: {
          type: 'string'
        }
      }]
    }
  }

  api.paths['/private-api-docs.json'] = {
    get: {
      summary: 'Accéder à la documentation privée de l\'API',
      operationId: 'readPrivateApiDoc',
      'x-permissionClass': 'readAdvanced',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: 'La documentation privée de l\'API',
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
      summary: 'Accéder au journal',
      operationId: 'readJournal',
      'x-permissionClass': 'readAdvanced',
      tags: ['Métadonnées'],
      responses: {
        200: {
          description: 'Le journal',
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
      summary: 'Envoyer une notification relative au jeu de données à la visibilité interne au compte',
      operationId: 'sendUserNotification',
      'x-permissionClass': 'write',
      'x-altPermissions': [{ id: 'sendUserNotificationPublic', class: 'write', title: 'Envoyer une notification relative au jeu de données à la visibilité externe au compte' }],
      tags: ['Métadonnées']
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
        type: 'string'
      }
    }
    api.paths['/lines/{lineId}'] = {
      parameters: [lineId],
      get: {
        summary: 'Récupérer une ligne de données',
        operationId: 'readLine',
        'x-permissionClass': 'read',
        tags: ['Données éditables'],
        responses: {
          200: {
            description: 'Le contenu d\'une ligne de données',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      put: {
        summary: 'Remplacer une ligne de données',
        operationId: 'updateLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu d\'une ligne de données',
          required: true,
          content: {
            'application/json': {
              schema: patchLineSchema
            }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données modifiée',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      patch: {
        summary: 'Modifier une ligne de données',
        operationId: 'patchLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu partiel d\'une ligne de données',
          required: true,
          content: {
            'application/json': {
              schema: patchLineSchema
            }
          }
        },
        responses: {
          200: {
            description: 'La ligne de données après modification',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      delete: {
        summary: 'Supprimer une ligne de données',
        operationId: 'deleteLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'La ligne de données a été supprimée'
          }
        }
      }
    }
    api.paths['/lines'] = {
      ...api.paths['/lines'],
      post: {
        summary: 'Ajouter une ligne de données',
        operationId: 'createLine',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Le contenu d\'une ligne de données',
          required: true,
          content: {
            'application/json': {
              schema: writeLineSchema
            }
          }
        },
        responses: {
          201: {
            description: 'La ligne de données ajoutée',
            content: {
              'application/json': {
                schema: readLineSchema
              }
            }
          }
        }
      },
      delete: {
        summary: 'Supprimer toutes les lignes de données',
        operationId: 'deleteAllLines',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        responses: {
          204: {
            description: 'Toutes les lignes de données ont été supprimées'
          }
        }
      }
    }
    api.paths['/_bulk_lines'] = {
      post: {
        summary: 'Créer/modifier/supprimer de multiples lignes en une seule opération',
        operationId: 'bulkLines',
        'x-permissionClass': 'write',
        tags: ['Données éditables'],
        requestBody: {
          description: 'Les opérations à appliquer',
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
            description: 'Le résultat des opérations',
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
          p.summary += ' (restreint par propriétaire de ligne)'
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
          summary: 'Récupérer des informations techniques',
          tags: ['Administration'],
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Informations techniques de diagnostic',
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
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'accusé de réception de la demande de reindexation',
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
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'accusé de réception de la demande de re-finalisation',
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
          'x-permissionClass': 'superadmin',
          responses: {
            204: {
              description: 'accusé de réception de la demande de suppression des locks'
            }
          }
        }
      }
    })
  }
  if (dataset.isRest && user.adminMode) {
    api.paths['/_sync_attachments_lines'] = {
      post: {
        summary: 'Re-synchroniser les lignes du jeux de données avec les pièces jointes présentes',
        tags: ['Administration'],
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'accusé de réception de la demande re-synchronisation',
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
        summary: 'Récupérer la clé API de lecture',
        operationId: 'getReadApiKey',
        'x-permissionClass': 'read',
        tags: ['Métadonnées'],
        responses: {
          200: {
            description: 'La clé API de lecture',
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
