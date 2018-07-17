const config = require('config')
const applicationSchema = require('./application')
const journalSchema = require('./journal')
const version = require('../package.json').version
const permissionsDoc = require('../server/utils/permissions').apiDoc

module.exports = (application) => {
  const publicPermissions = (application.permissions || []).find(p => !p.type && !p.id)
  const publicOperations = (publicPermissions && publicPermissions.operations) || []
  const publicClasses = (publicPermissions && publicPermissions.classes) || []
  const api = {
    openapi: '3.0.0',
    info: Object.assign({
      title: `Utilisation de l'application : ${application.title || application.id}`,
      version: version
    }, config.info),
    components: {
      securitySchemes: {
        jwt: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    servers: [{
      url: `${config.publicUrl}/api/v1/applications/${application.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de description de l\'application.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          security: (publicOperations.indexOf('readDescription') || publicClasses.indexOf('read')) ? [] : [{ jwt: [] }],
          tags: ['Configuration'],
          responses: {
            200: {
              description: 'Les informations de configuration de l\'application.',
              content: {
                'application/json': {
                  schema: applicationSchema
                }
              }
            }
          }
        },
        patch: {
          summary: 'Mettre à jour la description de l\'application.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          security: (publicOperations.indexOf('writeDescription') || publicClasses.indexOf('write')) ? [] : [{ jwt: [] }],
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration de l\'application.',
            required: true,
            content: {
              'application/json': {
                schema: applicationSchema
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations de configuration de l\'application',
              content: {
                'application/json': {
                  schema: applicationSchema
                }
              }
            }
          }
        },
        delete: {
          summary: 'Pour supprimer cette configuration de l\'application',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          security: [{ jwt: [] }],
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
          security: (publicOperations.indexOf('readConfig') || publicClasses.indexOf('read')) ? [] : [{ jwt: [] }],
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
          security: (publicOperations.indexOf('writeConfig') || publicClasses.indexOf('write')) ? [] : [{ jwt: [] }],
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
          security: (publicOperations.indexOf('readApiDoc') || publicClasses.indexOf('read')) ? [] : [{ jwt: [] }],
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
          'x-permissionClass': 'read',
          security: (publicOperations.indexOf('readJournal') || publicClasses.indexOf('read')) ? [] : [{ jwt: [] }],
          tags: ['Informations'],
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
      },
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/'
    }
  }
  return api
}
