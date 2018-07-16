const config = require('config')
const status = require('./status')
const version = require('../package.json').version
const dataset = require('./dataset')
const remoteService = require('./remote-service')
const catalog = require('./catalog')
const application = require('./application')

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
  components: {
    schemas: {
      dataset,
      remoteService,
      application,
      catalog
    },
    securitySchemes: {
      jwt: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  paths: {
    '/status': {
      get: {
        summary: 'Etat de santé du service.',
        description: 'Pour connaitre l\'état de santé du service.',
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
      get: {
        summary: 'Récupérer la liste des jeux de données.',
        operationId: 'listDatasets',
        security: [{}, { jwt: [] }],
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
      },
      post: {
        summary: 'Importer un jeu de données.',
        operationId: 'postDataset',
        security: [{ jwt: [] }],
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
                schema: {
                  $ref: '#/components/schemas/dataset'
                }
              }
            }
          }
        }
      }
    },
    '/remote-services': {
      get: {
        summary: 'Récupérer la liste des services distants.',
        operationId: 'listRemoteServices',
        security: [{}, { jwt: [] }],
        responses: {
          200: {
            description: 'Liste des services distants que l\'utilisateur est autorisé à voir',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: {
                      type: 'number',
                      description: 'Nombre total de services distants'
                    },
                    results: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/remoteService'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Configurer un service distant.',
        operationId: 'postRemoteService',
        security: [{ jwt: [] }],
        requestBody: {
          description: 'Les informations de configuration du service distant.',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/remoteService'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Les informations de configuration du service distant.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/remoteService'
                }
              }
            }
          }
        }
      }
    },
    '/catalogs': {
      get: {
        summary: 'Récupérer la liste des catalogues.',
        operationId: 'listCatalogs',
        security: [{}, { jwt: [] }],
        responses: {
          200: {
            description: 'Liste des catalogues que l\'utilisateur est autorisé à voir',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: {
                      type: 'number',
                      description: 'Nombre total de catalogues'
                    },
                    results: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/catalog'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Configurer un catalogue.',
        operationId: 'postCatalog',
        security: [{ jwt: [] }],
        requestBody: {
          description: 'Les informations de configuration du catalogue.',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/catalog'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Les informations de configuration du catalogue.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/catalog'
                }
              }
            }
          }
        }
      }
    },
    '/applications': {
      get: {
        summary: 'Récupérer la liste des applications.',
        operationId: 'listApplications',
        security: [{}, { jwt: [] }],
        responses: {
          200: {
            description: 'Liste des applications que l\'utilisateur est autorisé à voir',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: {
                      type: 'number',
                      description: 'Nombre total d\'applications'
                    },
                    results: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/application'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Configurer une application.',
        operationId: 'postApplication',
        security: [{ jwt: [] }],
        requestBody: {
          description: 'Les informations de configuration de l\'application',
          required: true,
          content: {
            schema: {
              $ref: '#/components/schemas/application'
            }
          }
        },
        responses: {
          200: {
            description: 'Les informations de configuration de l\'application',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/application'
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
