import config from 'config'
import { resolvedSchema as applicationSchema } from '../types/application/index.js'
import journalSchema from './journal.js'
import { apiDoc as permissionsDoc } from '../src/misc/utils/permissions.js'
import pJson from './p-json.js'

/**
 *
 * @param {any} application
 * @param {any} info
 * @returns any
 */
export default (application, info) => {
  const api = {
    openapi: '3.1.0',
    info: {
      title: `API de l'application : ${application.title || application.id}`,
      version: pJson.version,
      // @ts-ignore
      termsOfService: config.info.termsOfService,
      contact: { ...(info.contact || {}) }
    },
    components: {
      schemas: { applicationSchema },
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-apiKey'
        }
      }
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    servers: [{
      // @ts-ignore
      url: `${config.publicUrl}/api/v1/applications/${application.id}`,
      // @ts-ignore
      description: `Application Data Fair - ${new URL(config.publicUrl).hostname} - ${application.title}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Lire les informations',
          description: 'Récupérer les informations de l\'application.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Configuration'],
          responses: {
            200: {
              description: 'Les informations de configuration de l\'application.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/applicationSchema' }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Modifier l\'application',
          description: 'Mettre à jour les informations de l\'application.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration de l\'application.',
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/applicationSchema' }
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations de configuration modifiées de l\'application.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/applicationSchema' }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer l\'application',
          description: 'Supprimer cette application.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Application supprimée.'
            }
          }
        }
      },
      '/config': {
        get: {
          summary: 'Lire la configuration actuelle',
          description: 'Récupérer la configuration de l\'application.',
          operationId: 'readConfig',
          'x-permissionClass': 'read',
          tags: ['Paramétrage'],
          responses: {
            200: {
              description: 'La configuration de l\'application.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Modifier la configuration',
          description: 'Mettre à jour la configuration de l\'application.',
          operationId: 'writeConfig',
          'x-permissionClass': 'write',
          tags: ['Paramétrage'],
          requestBody: {
            description: 'La configuration de l\'application.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'La configuration modifiée de l\'application.',
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
      '/api-docs.json': {
        get: {
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation au format OpenAPI v3.',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La documentation de l\'API.',
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
      '/journal': {
        get: {
          summary: 'Lister les événements',
          description: 'Lister les événements du journal de l\'application.',
          operationId: 'readJournal',
          'x-permissionClass': 'readAdvanced',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le journal d\'événements de l\'application.',
              content: {
                'application/json': {
                  schema: journalSchema
                }
              }
            }
          }
        }
      },
      '/capture': {
        get: {
          summary: 'Générer une capture PNG',
          description: 'Générer une capture d\'écran de l\'application.',
          operationId: 'readCapture',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La capture d\'écran générée.',
              content: {
                'image/png': {}
              }
            }
          }
        }
      },
      '/print': {
        get: {
          summary: 'Générer une impression PDF',
          description: 'Générer une impression PDF de l\'application.',
          operationId: 'readPrint',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le PDF généré.',
              content: {
                'application/pdf': {}
              }
            }
          }
        }
      },
      '/attachments': {
        post: {
          summary: 'Charger une pièce jointe',
          description: 'Charger une pièce jointe dans les métadonnées.',
          operationId: 'postAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          responses: {
            204: {
              description: 'La pièce jointe a été chargée.'
            }
          }
        }
      },
      '/attachments/{attachmentId}': {
        delete: {
          summary: 'Supprimer une pièce jointe',
          description: 'Supprimer une pièce jointe des métadonnées.',
          operationId: 'deleteAttachment',
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
      },
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io/master/'
    }
  }
  return api
}
