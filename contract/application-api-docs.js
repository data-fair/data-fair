const config = require('config')
const applicationSchema = require('./application.json')
const version = require('../package.json').version

module.exports = (application) => {
  const api = {
    openapi: '3.0.0',
    info: Object.assign({
      title: `Utilisation de l'application : ${application.title || application.id}`,
      version: version
    }, config.info),
    servers: [{
      url: `${config.publicUrl}/api/v1/applications/${application.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de configuration de l\'application.',
          operationId: 'readDescription',
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
          summary: 'Mettre à jour les informations de configuration de l\'application.',
          operationId: 'writeDescription',
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
          summary: 'Mettre à jour le paramétrage de l\'application..',
          operationId: 'writeConfig',
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
      }
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/'
    }
  }
  return api
}
