import config from 'config'
import applicationSchema from './application.js'
import journalSchema from './journal.js'
import * as permissionsDoc from '../src/misc/utils/permissions.js'
import pJson from '../package.json' with {type: 'json'}

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
              description: 'Les informations de configuration de l\'application',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/applicationSchema' }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Pour supprimer cette configuration de l\'application',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu'
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
          summary: 'Accéder à la documentation de l\'API',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La documentation de l\'API',
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
          summary: 'Accéder au journal',
          operationId: 'readJournal',
          'x-permissionClass': 'readAdvanced',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le journal.',
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
          summary: 'Une capture d\'écran',
          operationId: 'readCapture',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La capture',
              content: {
                'image/png': {}
              }
            }
          }
        }
      },
      '/print': {
        get: {
          summary: 'Une impression PDF',
          operationId: 'readPrint',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'La capture',
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
          operationId: 'postAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées']
        }
      },
      '/attachments/{attachmentId}': {
        delete: {
          summary: 'Supprimer une pièce jointe',
          operationId: 'deleteAttachment',
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
      },
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io'
    }
  }
  return api
}
