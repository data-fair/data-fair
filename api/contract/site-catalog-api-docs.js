import config from '#config'
import pJson from './p-json.js'
import { resolvedSchema as datasetSchema } from '#types/dataset/index.ts'
import * as utils from './utils.js'

/** Builds the OpenAPI documentation for a publication site's catalog (the developer-facing dataset listing). */
export default (publicUrl, publicationSite, info) => {
  const hostname = new URL(publicUrl).hostname
  const servers = [{
    url: `${publicUrl}/api/v1/catalog`,
    description: `Catalogue de données - ${hostname}`
  }]

  return {
    openapi: '3.1.0',
    info: {
      title: 'API de catalogue de données',
      description: `Cette documentation est à destination de développeurs souhaitant explorer ou moissonner le catalogue de données de ${hostname}.`,
      version: pJson.version,
      'x-api-id': `${new URL(publicUrl).hostname.replace(/\./g, '-')}-catalog`,
      termsOfService: config.info.termsOfService,
      contact: { ...(info.contact || {}) }
    },
    servers,
    components: {
      schemas: {
        dataset: datasetSchema
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
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation au format OpenAPI v3.',
          operationId: 'getApiDoc',
          responses: {
            200: {
              description: 'La documentation OpenAPI du catalogue.',
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
          summary: 'Lister les jeux de données',
          description: 'Récupérer la liste des jeux de données.',
          operationId: 'listDatasets',
          parameters: [
            utils.qParam,
            utils.selectParam(Object.keys(datasetSchema.properties)),
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
          summary: 'Lister les jeux de données (DCAT)',
          description: 'Récupérer la liste des jeux de données au format DCAT (JSON-LD).',
          operationId: 'getDcat',
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
      description: 'Documentation sur GitHub',
      url: 'https://data-fair.github.io/master/'
    },
    definitions: {
      API: {
        type: 'object',
        description: 'OpenAPI v3 compliant documentation'
      }
    }
  }
}
