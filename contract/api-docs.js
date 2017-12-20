const config = require('config')
const status = require('./status.json')
const version = require('../package.json').version
const dataset = require('./dataset.json')

module.exports = {
  openapi: '3.0.0',
  info: Object.assign({
    title: 'Mes jeux de données',
    version: version,
    'x-api-id': 'accessible-data'
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
        summary: 'Charger un jeu de données',
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
    }
  },
  externalDocs: {
    description: 'Documentation sur Github',
    url: 'https://koumoul-dev.github.io/accessible-data/'
  }
}
