const config = require('config')
const status = require('./status.json')

module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Documentation de l\'API',
    description: 'Cette documentation s\'adresse aux développeurs et décrit l\'ensemble des opérations de l\'API de géocodage. Le format de cette documentation est basé sur la spécification [OpenAPI 3.0](https://www.openapis.org/) qui est le successeur de Swagger. Cette documentation peut être chargée dans n\'importe quel lecteur compatible avec le format OpenAPI 3.0 en utilisant le lien vers le [fichier source](./api/v1/api-docs.json).\n\nCette API est utilisable gratuitement sans conditions, mais l\'utilisation est alors très réduite. Pour pouvoir l\'utiliser plus largement, il faut créer un compte sur [notre site](https://koumoul.com) et utiliser votre [jeton d\'authentification](/t/my-access) pour faire les requêtes. Vous trouverez plus de détails sur les plans et conditions d\'utilisation de nos service [à cette page](/t/).',
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    },
    version: '1.0.0'
  },
  servers: [{
    url: config.baseUrl + '/api/v1',
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
