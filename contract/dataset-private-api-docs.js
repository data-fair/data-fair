const config = require('config')
const datasetAPIDocs = require('./dataset-api-docs')
const datasetPost = require('./dataset-post')
const { visibility } = require('../server/utils/visibility')
const permissionsDoc = require('../server/utils/permissions').apiDoc

module.exports = (dataset, publicUrl = config.publicUrl, user) => {
  const { api, datasetPatchSchema, userApiRate, anonymousApiRate } = datasetAPIDocs(dataset, publicUrl)

  const title = `API privée du jeu de données : ${dataset.title || dataset.id}`

  let description = `
Cette documentation interactive à destination des développeurs permet de gérer et consommer les ressources du jeu de données "${dataset.title || dataset.id}".
`

    if (dataset.isVirtual) {
      description += `
Ce jeu de données est virtuel. C'est à dire qu'il est constitué de redirections vers un ensemble de jeux de données et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
    }

    if (dataset.isRest) {
      description += `
Ce jeu de données est incrémental. C'est à dire qu'il est constitué dynamiquement à partir de lectures / écritures de lignes et qu'il n'a pas été créé à partir d'un fichier téléchargeable.
`
    }

    description += `
Pour protéger l'infrastructure de publication de données, les appels sont limités par quelques règles simples :
  
- ${userApiRate}
`

    if (visibility(dataset) !== 'public') {
      description += `
Pour utiliser cette API dans un programme vous aurez besoin d'une clé que vous pouvez créer dans les paramètres du compte.
`
    } else {
      description += `
- ${anonymousApiRate}
`
    }

    api.components.securitySchemes = {
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
    }
    api.security = [{ apiKey: [] }, { sdCookie: [] }]

  Object.assign(api.info, { title, description })
  api.info.description = description

  Object.assign(api.paths['/'], {
    patch: {
      summary: 'Mettre à jour les informations du jeu de données.',
      operationId: 'writeDescription',
      'x-permissionClass': 'write',
      tags: ['Métadonnées'],
      requestBody: {
        description: 'Fichier à charger et informations de propriété',
        required: true,
        content: {
          'application/json': {
            schema: datasetPatchSchema,
          },
        },
      },
      responses: {
        200: {
          description: 'Les informations du jeu de données.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/datasetSchema' },
            },
          },
        },
      },
    },
    post: {
      summary: 'Mettre à jour les données du jeu de données.',
      operationId: 'writeData',
      'x-permissionClass': 'write',
      tags: ['Données'],
      requestBody: {
        description: 'Fichier à charger et autres informations',
        required: true,
        content: {
          'multipart/form-data': {
            schema: datasetPost,
          },
        },
      },
      responses: {
        200: {
          description: 'Métadonnées sur le dataset modifié',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/datasetSchema' },
            },
          },
        },
      },
    },
    delete: {
      summary: 'Supprimer le jeu de données.',
      operationId: 'delete',
      'x-permissionClass': 'admin',
      tags: ['Métadonnées'],
      responses: {
        204: {
          description: 'Suppression effectuée',
        },
      },
    },
  })

  Object.assign(api.paths, {
    '/_diagnose': {
      get: {
        summary: 'Récupérer des informations techniques',
        tags: ['Administration'],
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'Informations techniques de diagnostic',
            content: {
              'application/json': {},
            },
          },
        },
      },
    },
    '/_reindex': {
      post: {
        summary: 'Forcer la reindexation',
        tags: ['Administration'],
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'accusé de réception de la demande reindexation',
            content: {
              'application/json': {},
            },
          },
        },
      },
    },
    '/_refinalize': {
      post: {
        summary: 'Forcer la re-finalisation',
        tags: ['Administration'],
        'x-permissionClass': 'superadmin',
        responses: {
          200: {
            description: 'accusé de réception de la demande re-finalisation',
            content: {
              'application/json': {},
            },
          },
        },
      },
    },
    '/permissions': permissionsDoc,
  })

  if (dataset.isMetaOnly) {
    delete api.paths['/_refinalize']
    delete api.paths['/_reindex']
    delete api.paths['/_diagnose']
    delete api.paths['/'].post
  }

  return api
}
