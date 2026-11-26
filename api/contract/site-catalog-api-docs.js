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
      ...(config.info.termsOfService ? { termsOfService: config.info.termsOfService } : {}),
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
          description: 'Accéder à la documentation du catalogue au format OpenAPI v3.',
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
            utils.booleanParam('file', 'Restreindre aux jeux avec fichiers attachés'),
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
          summary: 'Catalogue DCAT-AP',
          description: 'Récupérer le catalogue des jeux de données publiés sur ce portail au format [DCAT-AP 3](https://semiceu.github.io/DCAT-AP/releases/3.0.0/) (profil européen, JSON-LD), à utiliser comme URL de moissonnage DCAT sur data.gouv.fr ou data.europa.eu. Chaque jeu de données porte ses fichiers téléchargeables, ses pièces jointes publiées sur les catalogues et, s\'il contient des données, une distribution API reliée à un `dcat:DataService` dont `dcat:endpointDescription` pointe vers la documentation OpenAPI du jeu. Les textes générés (titres et descriptions des distributions) suivent la langue de la requête (français par défaut, anglais).',
          operationId: 'getDcat',
          responses: {
            200: {
              description: 'Catalogue des jeux de données au format DCAT-AP (JSON-LD)',
              content: {
                'application/ld+json': {
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
      url: 'https://data-fair.github.io/'
    }
  }
}
