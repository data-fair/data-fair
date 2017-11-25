const config = require('config')
const status = require('./status.json')
const version = require('../package.json').version

module.exports = {
  openapi: '3.0.0',
  info: Object.assign({
    title: 'API documentation',
    version: version
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
    }
  }
}
