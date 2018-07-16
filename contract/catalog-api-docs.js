const config = require('config')
const catalogSchema = require('./catalog')
const permissionsDoc = require('../server/utils/permissions').apiDoc

module.exports = (catalog) => {
  const publicPermissions = (catalog.permissions || []).find(p => !p.type && !p.id)
  const publicOperations = (publicPermissions && publicPermissions.operations) || []
  const publicClasses = (publicPermissions && publicPermissions.classes) || []
  const api = {
    openapi: '3.0.0',
    info: {
      title: `Intégration du catalogue : ${catalog.url}`
    },
    servers: [{
      url: `${config.publicUrl}/api/v1/catalogs/${catalog.id}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de configuration du catalogue.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          security: (publicOperations.indexOf('readDescription') || publicClasses.indexOf('read')) ? [] : [{ jwt: [] }],
          tags: ['Configuration'],
          responses: {
            200: {
              description: 'Les informations de configuration du catalogue.',
              content: {
                'application/json': {
                  schema: catalogSchema
                }
              }
            }
          }
        },
        patch: {
          summary: 'Mettre à jour les informations de configuration du catalogue.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          security: (publicOperations.indexOf('writeDescription') || publicClasses.indexOf('write')) ? [] : [{ jwt: [] }],
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration du catalogue.',
            required: true,
            content: {
              'application/json': {
                schema: catalogSchema
              }
            }
          },
          responses: {
            200: {
              description: 'Les informations de configuration du catalogue',
              content: {
                'application/json': {
                  schema: catalogSchema
                }
              }
            }
          }
        },
        delete: {
          summary: 'Pour supprimer cette configuration du catalogue',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          security: [{ jwt: [] }],
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu'
            }
          }
        }
      },
      '/permissions': permissionsDoc
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/'
    }
  }
  return api
}
