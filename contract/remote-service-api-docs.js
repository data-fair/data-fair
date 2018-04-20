const config = require('config')
const remoteServiceSchema = require('./remote-service')

module.exports = (remoteService) => {
  const api = {
    openapi: '3.0.0',
    info: Object.assign({}, remoteService.apiDoc.info, {
      title: `Utilisation du service distant : ${remoteService.title || remoteService.id}`
    }),
    servers: [{
      url: `${config.publicUrl}/api/v1/remote-services/${remoteService.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de configuration du service distant.',
          operationId: 'readDescription',
          tags: ['Configuration'],
          responses: {
            200: {
              description: 'Les informations de configuration du service distant.',
              content: {
                'application/json': {
                  schema: remoteServiceSchema
                }
              }
            }
          }
        },
        patch: {
          summary: 'Mettre à jour les informations de configuration du service distant.',
          operationId: 'writeDescription',
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration du service distant.',
            required: true,
            content: {
              'application/json': {
                schema: remoteServiceSchema
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations de configuration du service distant',
              content: {
                'application/json': {
                  schema: remoteServiceSchema
                }
              }
            }
          }
        },
        delete: {
          summary: 'Pour supprimer cette configuration du service distant',
          operationId: 'delete',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu'
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
  Object.assign(api.paths, ...Object.keys(remoteService.apiDoc.paths).map(path => ({['/proxy' + path]: remoteService.apiDoc.paths[path]})))
  return api
}
