import config from 'config'
import _remoteServiceSchema from './remote-service.js'
import _remoteServicePatchSchema from './remote-service-patch.js'
import { apiDoc as permissionsDoc } from '../src/misc/utils/permissions.js'

const remoteServiceSchema = { ..._remoteServiceSchema }
const remoteServicePatchSchema = { ..._remoteServicePatchSchema }
delete remoteServiceSchema.definitions
delete remoteServicePatchSchema.definitions

export default (remoteService) => {
  const api = {
    openapi: '3.1.0',
    info: Object.assign({}, remoteService.apiDoc?.info, {
      title: `API du service distant : ${remoteService.title || remoteService.id}`,
      description: remoteService.description
    }),
    servers: [{
      url: `${config.publicUrl}/api/v1/remote-services/${remoteService.id}`
    }],
    components: {
      schemas: remoteService.apiDoc?.components?.schemas || {},
      securitySchemes: {
        sdCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'id_token'
        },
        siCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session_id'
        }
      }
    },
    security: [{ siCookie: [] }, { sdCookie: [] }],
    paths: {
      '/': {
        get: {
          summary: 'Lire les informations',
          description: 'Récupérer les informations de configuration du service distant.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
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
          summary: 'Modifier le service',
          description: 'Mettre à jour les informations de configuration du service distant.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration du service distant.',
            required: true,
            content: {
              'application/json': {
                schema: remoteServicePatchSchema
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
          summary: 'Supprimer le service',
          description: 'Pour supprimer cette configuration du service distant.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu'
            }
          }
        }
      },
      '/_update': {
        get: {
          summary: 'Resynchroniser le service',
          description: 'Se resynchroniser avec l\'API du service distant.',
          operationId: 'updateApiDoc',
          'x-permissionClass': 'write',
          tags: ['Configuration'],
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
        }
      },
      '/api-docs.json': {
        get: {
          summary: 'Obtenir la documentation OpenAPI',
          description: 'Accéder à cette documentation au format OpenAPI v3.',
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Informations'],
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
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://data-fair.github.io/master/'
    },
    definitions: {
      API: {
        type: 'object',
        description: 'Open API v3 compliant documentation'
      }
    }
  }
  const apiPaths = Object.keys(remoteService.apiDoc?.paths ?? {}).reduce((a, path) => {
    a['/proxy' + path] = JSON.parse(JSON.stringify(remoteService.apiDoc.paths[path]))
    return a
  }, {})
  for (const apiPath in apiPaths) {
    for (const operation in apiPaths[apiPath]) {
      const permissionClass = apiPaths[apiPath][operation]['x-permissionClass']
      const tags = apiPaths[apiPath][operation].tags
      // exclude some operations (mostly useful in case of a dataset exposed as a remote service)
      if (tags && tags.includes('Administration')) {
        delete apiPaths[apiPath][operation]
      } else if (permissionClass && ['superadmin', 'admin', 'write'].includes(permissionClass)) {
        delete apiPaths[apiPath][operation]
      } else {
        apiPaths[apiPath][operation]['x-permissionClass'] = 'use'
      }
    }
    if (Object.keys(apiPaths[apiPath]).length) {
      api.paths[apiPath] = apiPaths[apiPath]
    }
  }
  return api
}
