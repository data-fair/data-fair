import config from 'config'
import applicationSchema from './application.js'
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
      title: `Intégration de l'application : ${application.title || application.id}`,
      version: pJson.version,
      // @ts-ignore
      termsOfService: config.info.termsOfService,
      contact: { ...(info.contact || {}) }
    },
    components: {
      schemas: { applicationSchema, journalSchema },
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
      }
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    servers: [{
      // @ts-ignore
      url: `${config.publicUrl}/api/v1/applications/${application.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de description de l\'application.',
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
          summary: 'Mettre à jour la description de l\'application.',
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
              description: 'Les informations de configuration de l\'application.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/applicationSchema' }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer cette configuration de l\'application.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu.'
            }
          }
        }
      },
      '/config': {
        get: {
          summary: 'Utiliser l\'application.', // To use an application, we must be able to read its configuration
          operationId: 'readConfig',
          'x-permissionClass': 'read',
          tags: ['Paramétrage'],
          responses: {
            200: {
              description: 'Le paramétrage de l\'application.',
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
          summary: 'Mettre à jour le paramétrage de l\'application.',
          operationId: 'writeConfig',
          'x-permissionClass': 'write',
          tags: ['Paramétrage'],
          requestBody: {
            description: 'Le paramétrage de l\'application.',
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
              description: 'Le paramétrage de l\'application.',
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
          summary: 'Accéder à cette documentation au format OpenAPI v3.',
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
          summary: 'Lister les événements du journal de l\'application.',
          operationId: 'readJournal',
          'x-permissionClass': 'readAdvanced',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le journal de l\'application.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/journalSchema' }
                }
              }
            }
          }
        }
      },
      '/capture': {
        get: {
          summary: 'Générer une capture d\'écran de l\'application.',
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
          summary: 'Générer une impression PDF de l\'application.',
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
          summary: 'Charger une pièce jointe.',
          operationId: 'postAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          responses: {
            204: {
              description: 'Aucun contenu.'
            }
          }
        }
      },
      '/attachments/{attachmentId}': {
        delete: {
          summary: 'Supprimer une pièce jointe.',
          operationId: 'deleteAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          parameters: [{
            in: 'path',
            name: 'attachmentId',
            description: 'Identifiant de la pièce jointe.',
            required: true,
            schema: {
              type: 'string'
            }
          }],
          responses: {
            204: {
              description: 'Aucun contenu.'
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
