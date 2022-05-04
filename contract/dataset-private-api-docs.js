const config = require('config')
const datasetAPIDocs = require('./dataset-api-docs')
const datasetPost = require('./dataset-post')
const journalSchema = require('./journal')
const { visibility } = require('../server/utils/visibility')
const permissionsDoc = require('../server/utils/permissions').apiDoc
const datasetUtils = require('../server/utils/dataset')
const datasetPatchSchema = require('./dataset-patch')

module.exports = (dataset, publicUrl = config.publicUrl, user) => {
  const { api, userApiRate, anonymousApiRate, bulkLineSchema } = datasetAPIDocs(dataset, publicUrl)

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
      summary: 'Mettre à jour les informations du jeu de données.',
      operationId: 'writeDescription',
      'x-permissionClass': 'write',
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
      summary: 'Supprimer le jeu de données.',
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
          description: 'Le journal.',
          content: {
            'application/json': {
              schema: journalSchema
            }
          }
        }
      }
    }
  }

  if (dataset.isRest) {
    const readLineSchema = datasetUtils.jsonSchema(dataset.schema, publicUrl, true, false)
    const writeLineSchema = datasetUtils.jsonSchema(dataset.schema, publicUrl, false, true)
    const patchLineSchema = datasetUtils.jsonSchema(dataset.schema, publicUrl, false, false)
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

  return api
}
