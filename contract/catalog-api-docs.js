const config = require('config')
const catalogSchema = require('./catalog')
const permissionsDoc = require('../server/utils/permissions').apiDoc

module.exports = (catalog) => {
  const api = {
    openapi: '3.1.0',
    info: {
      title: `Intégration du catalogue : ${catalog.url}`,
    },
    servers: [{
      url: `${config.publicUrl}/api/v1/catalogs/${catalog.id}`,
    }],
    components: {
      schemas: { catalogSchema },
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-apiKey',
        },
        sdCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'id_token',
        },
      },
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    paths: {
      '/': {
        get: {
          summary: 'Récupérer les informations de configuration du catalogue.',
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Configuration'],
          responses: {
            200: {
              description: 'Les informations de configuration du catalogue.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/catalogSchema' },
                },
              },
            },
          },
        },
        patch: {
          summary: 'Mettre à jour les informations de configuration du catalogue.',
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Configuration'],
          requestBody: {
            description: 'Les informations de configuration du catalogue.',
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/catalogSchema' },
              },
            },
          },
          responses: {
            200: {
              description: 'Les informations de configuration du catalogue',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/catalogSchema' },
                },
              },
            },
          },
        },
        delete: {
          summary: 'Pour supprimer cette configuration du catalogue',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Aucun contenu',
            },
          },
        },
      },
      '/permissions': permissionsDoc,
    },
    externalDocs: {
      description: 'Documentation sur Github',
      url: 'https://koumoul-dev.github.io/data-fair/',
    },
  }
  return api
}
