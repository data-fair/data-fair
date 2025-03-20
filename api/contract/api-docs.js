import config from 'config'
import dataset from './dataset.js'
import datasetPatch from './dataset-patch.js'
import datasetPost from './dataset-post.js'
import remoteService from './remote-service.js'
import remoteServicePatch from './remote-service-patch.js'
import catalog from './catalog.js'
import catalogPatch from './catalog-patch.js'
import application from './application.js'
import applicationPatch from './application-patch.js'
import * as utils from './utils.js'
import pJson from './p-json.js'

export default () => {
  const doc = {
    openapi: '3.1.0',
    info: Object.assign({
      title: 'API principale',
      description: `
Cette documentation interactive à destination des développeurs permet de gérer les ressources de ce service de publication de données.

Notez que l'API réelle est plus riche, chaque jeu de données et chaque service distant disposant de sa propre API documentée séparément.

Pour utiliser cette API dans un programme vous aurez besoin d'une clé que vous pouvez créer dans vos paramètres personnels ou dans les paramètres d'une organisation dont vous êtes administrateur.

Pour des exemples simples de publication de données vous pouvez consulter la <a href="https://data-fair.github.io/4/interoperate/api" target="blank">documentation sur ce sujet</a>.
`,
      version: pJson.version,
      'x-api-id': 'data-fair'
      // @ts-ignore
    }, config.info),
    servers: [{
      // @ts-ignore
      url: `${config.publicUrl}/api/v1`,
      // @ts-ignore
      description: `Instance DataFair - ${new URL(config.publicUrl).hostname}`
    }],
    components: {
      schemas: {
        dataset,
        datasetPatch,
        datasetPost,
        remoteService: { ...remoteService },
        remoteServicePatch: { ...remoteServicePatch },
        application,
        applicationPatch,
        catalog,
        catalogPatch
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
      '/ping': {
        get: {
          summary: 'Obtenir l\'état de santé du service.',
          operationId: 'ping',
          tags: ['Administration'],
          'x-operationType': 'http://schema.org/CheckAction',
          responses: {
            200: {
              description: 'Service ok'
            },
            500: {
              description: 'Service ko'
            }
          }
        }
      },
      '/api-docs.json': {
        get: {
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation au format OpenAPI v3.',
          operationId: 'getApiDoc',
          tags: ['Administration'],
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
      '/vocabulary': {
        get: {
          summary: 'Lister les concepts',
          description: 'Récupérer la liste des concepts utilisables pour annoter la donnée sur ce service.',
          operationId: 'getVocabulary',
          tags: ['Administration'],
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        identifiers: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        type: { type: 'string' },
                        tag: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/datasets': {
        get: {
          summary: 'Lister les jeux de données',
          description: 'Récupérer la liste des jeux de données.',
          operationId: 'listDatasets',
          tags: ['Jeux de données'],
          parameters: [
            utils.qParam,
            ...utils.ownerParams,
            utils.booleanParam('raw', 'Ne pas inclure les champs calculés'),
            utils.selectParam(Object.keys(dataset.properties)),
            utils.filterParam('ids', 'Restreindre sur les identifiants'),
            utils.filterParam('filename', 'Restreindre sur les noms de fichier'),
            utils.filterParam('concepts', 'Restreindre sur les concepts annotés'),
            utils.filterParam('field-type', 'Restreindre sur les types de colonnes'),
            utils.filterParam('field-format', 'Restreindre sur les formats des colonnes textes'),
            utils.booleanParam('file', 'Restreindre aux jeux avec fichiers attachés'),
            utils.booleanParam('bbox', 'Restreindre aux jeux géographiques'),
            utils.booleanParam('queryable', 'Restreindre aux jeux requêtables et utilisables dans des applications'),
            ...utils.paginationParams,
            ...utils.visibilityParams
          ],
          responses: {
            200: {
              description: 'Liste des jeux de données que l\'utilisateur est autorisé à voir.',
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
          summary: 'Créer un jeu de données',
          operationId: 'postDataset',
          tags: ['Jeux de données'],
          requestBody: {
            description: 'Fichier à charger et autres informations.',
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  $ref: '#/components/schemas/datasetPost'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Métadonnées sur le dataset créé.',
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
      '/datasets/{id}': {
        parameters: [utils.idParam],
        get: {
          summary: 'Lire les informations d\'un jeu de données',
          description: 'Récupérer les informations d\'un jeu de données.',
          operationId: 'getDataset',
          tags: ['Jeux de données'],
          responses: {
            200: {
              description: 'Informations d\'un jeu de données.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/dataset'
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Créer ou mettre à jour un jeu de données',
          description: 'Créer ou mettre à jour un jeu de données.',
          operationId: 'putDataset',
          tags: ['Jeux de données'],
          requestBody: {
            description: 'Fichier à charger et autres informations.',
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  $ref: '#/components/schemas/datasetPost'
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Jeu de données créé.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/dataset'
                  }
                }
              }
            },
            200: {
              description: 'Jeu de données modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/dataset'
                  }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Modifier un jeu de données',
          description: 'Modifier seulement certaines informations d\'un jeu de données.',
          operationId: 'patchDataset',
          tags: ['Jeux de données'],
          requestBody: {
            description: 'Informations à modifier.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/datasetPatch'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Informations du jeu de données modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/dataset'
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer un jeu de données',
          operationId: 'deleteDataset',
          tags: ['Jeux de données'],
          responses: {
            204: {
              description: 'Jeu de données supprimé.'
            }
          }
        }
      },
      '/applications': {
        get: {
          summary: 'Lister les applications',
          description: 'Récupérer la liste des applications.',
          operationId: 'listApplications',
          tags: ['Applications'],
          parameters: [
            utils.qParam,
            ...utils.ownerParams,
            utils.booleanParam('raw', 'Ne pas inclure les champs calculés'),
            utils.selectParam(Object.keys(application.properties)),
            utils.filterParam('ids', 'Restreindre sur les identifiants'),
            utils.filterParam('dataset', 'Restreindre sur les jeux de données utilisés'),
            utils.filterParam('service', 'Restreindre sur les services distants utilisés'),
            ...utils.paginationParams,
            ...utils.visibilityParams
          ],
          responses: {
            200: {
              description: 'Liste des applications que l\'utilisateur est autorisé à voir.',
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
          summary: 'Configurer une application',
          operationId: 'postApplication',
          tags: ['Applications'],
          requestBody: {
            description: 'Les informations de configuration de l\'application.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/application'
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Les informations de configuration de l\'application.',
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
      },
      '/applications/{id}': {
        parameters: [utils.idParam],
        get: {
          summary: 'Lire les informations d\'une application',
          description: 'Récupérer les informations d\'une application.',
          operationId: 'getApplication',
          tags: ['Applications'],
          responses: {
            200: {
              description: 'Informations d\'une application.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/application'
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Créer ou mettre à jour une application',
          description: 'Créer ou mettre à jour une application.',
          operationId: 'putApplication',
          tags: ['Applications'],
          requestBody: {
            description: 'Informations de l\'application.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/application'
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Application créée.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/application'
                  }
                }
              }
            },
            200: {
              description: 'Application modifiée.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/application'
                  }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Modifier une informations',
          description: 'Modifier seulement certaines informations d\'une application.',
          operationId: 'patchApplication',
          tags: ['Applications'],
          requestBody: {
            description: 'Informations à modifier.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/applicationPatch'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Informations de l\'application modifiée.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/application'
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer une application',
          operationId: 'deleteApplication',
          tags: ['Applications'],
          responses: {
            204: {
              description: 'Application supprimée.'
            }
          }
        }
      },
      '/remote-services': {
        get: {
          summary: 'Lister les services',
          description: 'Récupérer la liste des services distants.',
          operationId: 'listRemoteServices',
          tags: ['Services distants'],
          parameters: [
            utils.qParam,
            utils.selectParam(Object.keys(remoteService.properties)),
            utils.filterParam('api-id', 'Restreindre sur l\'identifiant de l\'API d\'origine'),
            utils.filterParam('input-concepts', 'Restreindre sur les concepts en entrée des routes de l\'API'),
            utils.filterParam('output-concepts', 'Restreindre sur les concepts en sortie des routes de l\'API'),
            ...utils.paginationParams
          ],
          responses: {
            200: {
              description: 'Liste des services distants que l\'utilisateur est autorisé à voir.',
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
          summary: 'Configurer un service',
          description: 'Configurer un service distant.',
          operationId: 'postRemoteService',
          tags: ['Services distants'],
          requestBody: {
            description: 'Les informations du service distant.',
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
            201: {
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
      '/remote-services/{id}': {
        parameters: [utils.idParam],
        get: {
          summary: 'Lire les informations d\'un service',
          description: 'Récupérer les informations d\'un service distant.',
          operationId: 'getRemoteService',
          tags: ['Services distants'],
          responses: {
            200: {
              description: 'Informations d\'un service distant.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/remoteService'
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Créer ou mettre à jour un service',
          description: 'Créer ou mettre à jour un service distant.',
          operationId: 'putRemoteService',
          tags: ['Services distants'],
          requestBody: {
            description: 'Informations du service distant.',
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
            201: {
              description: 'Service distant créé.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/remoteService'
                  }
                }
              }
            },
            200: {
              description: 'Service distant modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/remoteService'
                  }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Modifier une informations',
          description: 'Modifier seulement certaines informations d\'un service distant.',
          operationId: 'patchRemoteService',
          tags: ['Services distants'],
          requestBody: {
            description: 'Informations à modifier.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/remoteServicePatch'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Informations du service distant modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/remoteService'
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer un service',
          description: 'Supprimer un service distant.',
          operationId: 'deleteRemoteService',
          tags: ['Services distants'],
          responses: {
            204: {
              description: 'Service distant supprimé.'
            }
          }
        }
      },
      '/catalogs': {
        get: {
          summary: 'Lister les catalogues',
          description: 'Récupérer la liste des catalogues.',
          operationId: 'listCatalogs',
          tags: ['Catalogues'],
          parameters: [
            utils.qParam,
            ...utils.ownerParams,
            utils.selectParam(Object.keys(application.properties)),
            ...utils.paginationParams,
            ...utils.visibilityParams
          ],
          responses: {
            200: {
              description: 'Liste des catalogues que l\'utilisateur est autorisé à voir.',
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
          summary: 'Configurer un catalogue',
          operationId: 'postCatalog',
          tags: ['Catalogues'],
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
            201: {
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
      '/catalogs/{id}': {
        parameters: [utils.idParam],
        get: {
          summary: 'Lire les informations d\'un catalogue',
          description: 'Récupérer les informations d\'un catalogue.',
          operationId: 'getCatalog',
          tags: ['Catalogues'],
          responses: {
            200: {
              description: 'Informations d\'un catalogue.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/catalog'
                  }
                }
              }
            }
          }
        },
        put: {
          summary: 'Créer ou mettre à jour un catalogue',
          operationId: 'putCatalog',
          tags: ['Catalogues'],
          requestBody: {
            description: 'Informations du catalogue.',
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
            201: {
              description: 'Catalogue créé.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/catalog'
                  }
                }
              }
            },
            200: {
              description: 'Catalogue modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/catalog'
                  }
                }
              }
            }
          }
        },
        patch: {
          summary: 'Modifier une informations',
          description: 'Modifier seulement certaines informations d\'un catalogue.',
          operationId: 'patchCatalog',
          tags: ['Catalogues'],
          requestBody: {
            description: 'Informations à modifier.',
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/catalogPatch'
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Informations du catalogue modifié.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/catalog'
                  }
                }
              }
            }
          }
        },
        delete: {
          summary: 'Supprimer un catalogue',
          operationId: 'deleteCatalog',
          tags: ['Catalogues'],
          responses: {
            204: {
              description: 'Catalogue supprimé.'
            }
          }
        }
      }
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io/master/'
    }
  }

  // TODO: shoud we keep some of this ?
  // @ts-ignore
  delete doc.paths['/remote-services']
  // @ts-ignore
  delete doc.paths['/remote-services/{id}']
  // @ts-ignore
  delete doc.paths['/catalogs']
  // @ts-ignore
  delete doc.paths['/catalogs/{id}']

  return doc
}
