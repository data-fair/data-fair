const config = require('config')
const version = require('../package.json').version
const dataset = require('./dataset')
const utils = require('./utils')

module.exports = (publicUrl, publicationSite, info) => {
  const hostname = new URL(publicUrl).hostname
  const servers = [{
    url: `${publicUrl}/api/v1/catalog`,
    description: `Catalogue de données - ${hostname}`
  }]

  return {
    openapi: '3.1.0',
    info: {
      title: 'API de catalogue de données',
      description: `Cette documentation est à destination de développeurs souhaitant explorer ou moissoner le catalogue de données de ${hostname}.`,
      version,
      'x-api-id': `${new URL(publicUrl).hostname.replace(/\./g, '-')}-catalog`,
      termsOfService: config.info.termsOfService,
      contact: { ...(info.contact || {}) }
    },
    servers,
    components: {
      schemas: {
        dataset
      },
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
    paths: {
      '/api-docs.json': {
        get: {
          summary: 'Cette documentation d\'API au format Open API v3',
          tags: ['Catalogue'],
          operationId: 'getApiDoc',
          responses: {
            200: {
              description: 'Etat de santé du service',
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            }
          }
        }
      },
      '/datasets': {
        get: {
          summary: 'Récupérer la liste des jeux de données.',
          operationId: 'listDatasets',
          tags: ['Catalogue'],
          parameters: [
            utils.qParam,
            utils.selectParam(Object.keys(dataset.properties)),
            utils.booleanParam('files', 'Restreindre aux jeux avec fichiers attachés'),
            utils.booleanParam('bbox', 'Restreindre aux jeux géographiques'),
            utils.booleanParam('queryable', 'Restreindre aux jeux requêtables et utilisables dans des applications'),
            ...utils.paginationParams
          ],
          responses: {
            200: {
              description: 'Liste des jeux de données que l\'utilisateur est autorisé à voir',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: {
                        type: 'number',
                        description: 'Nombre total de jeux de données'
                      },
                      results: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/dataset'
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/dcat': {
        get: {
          summary: 'Récupérer la liste des jeux de données au format DCAT (JSON-LD).',
          operation: 'dcat',
          tags: ['Catalogue'],
          responses: {
            200: {
              description: 'Liste des jeux de données au format DCAT (JSON-LD)',
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io'
    },
    definitions: {
      API: {
        type: 'object',
        description: 'Open API v3 compliant documentation'
      }
    }
  }
}
