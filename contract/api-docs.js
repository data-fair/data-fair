const config = require('config')
const status = require('./status.json')
const version = require('../package.json').version
const dataset = require('./dataset.json')
const remoteService = require('./remote-service.js')
const application = require('./application.json')

module.exports = {
  openapi: '3.0.0',
  info: Object.assign({
    title: 'Mes jeux de données',
    description: 'Ce service permet d’exposer facilement ses données via une API web, contractualisée et documentée, ce qui permet de les rendre interopérables et utilisables dans d’autres applications. Le partage des données peut se faire en mode privé ou public (opendata).',
    version: version,
    'x-api-id': 'data-fair'
  }, config.info),
  servers: [{
    url: config.publicUrl + '/api/v1',
    description: 'Serveur de ' + process.env.NODE_ENV || 'development'
  }],
  paths: {
    '/status': {
      get: {
        summary: 'Pour connaitre l\'état de santé du service.',
        operationId: 'getStatus',
        'x-operationType': 'http://schema.org/CheckAction',
        responses: {
          200: {
            description: 'Etat de santé du service',
            content: {
              'application/json': {
                schema: status,
                examples: [{
                  status: 'ok',
                  message: 'Service is ok',
                  details: 'Service is ok'
                }]
              }
            }
          }
        }
      }
    },
    '/datasets': {
      post: {
        summary: 'Importer un jeu de données',
        operationId: 'postDataset',
        requestBody: {
          description: 'Fichier à charger et informations de propriété',
          required: true,
          content: {}
        },
        responses: {
          200: {
            description: 'Métadonnées sur le dataset créé',
            content: {
              'application/json': {
                schema: dataset
              }
            }
          }
        }
      }
    },
    '/remote-services': {
      post: {
        summary: 'Configurer une réutilisation d\'un service externe',
        operationId: 'postRemoteService',
        requestBody: {
          description: 'Les informations de configuration du service distant.',
          required: true,
          content: {
            'application/json': {
              schema: remoteService
            }
          }
        },
        responses: {
          200: {
            description: 'Les informations de configuration du service distant.',
            content: {
              'application/json': {
                schema: remoteService
              }
            }
          }
        }
      }
    },
    '/applications': {
      post: {
        summary: 'Configurer une application',
        operationId: 'postApplication',
        requestBody: {
          description: 'Les informations de configuration de l\'application',
          required: true,
          content: {
            schema: application
          }
        },
        responses: {
          200: {
            description: 'Les informations de configuration de l\'application',
            content: {
              'application/json': {
                schema: application
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
