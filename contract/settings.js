const topic = require('./topic')

module.exports = {
  title: 'Settings',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the owner of this settings',
    },
    type: {
      type: 'string',
      enum: ['user', 'organization'],
      description: 'If the owner is a user or an organization',
    },
    name: {
      type: 'string',
      description: 'The name of the owner',
    },
    webhooks: {
      type: 'array',
      title: "Liste d'appels extérieurs",
      'x-sortable': false,
      'x-itemTitle': 'none',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'events', 'target'],
        properties: {
          title: {
            type: 'string',
            title: 'Titre',
          },
          events: {
            type: 'array',
            title: 'Événements déclencheurs',
            items: {
              type: 'string',
              oneOf: [{
                const: 'dataset-dataset-created',
                title: 'Un nouveau jeu de données a été créé',
              }, {
                const: 'dataset-data-updated',
                title: 'Le fichier d\'un jeu de données a été mis à jour',
              }, {
                const: 'dataset-error',
                title: 'Un jeu de données a rencontré une erreur',
              }, {
                const: 'dataset-finalize-end',
                title: 'Un jeu de données a été finalisé et mis en ligne',
              }, {
                const: 'dataset-publication',
                title: 'Un jeu de données a été publié sur un catalogue',
              }, {
                const: 'dataset-downloaded',
                title: 'Un jeu de données a été téléchargé dans un format fichier',
              }, {
                const: 'dataset-downloaded-filter',
                title: 'Un extrait filtré d\'un jeu de données a été téléchargé dans un format fichier',
              }, {
                const: 'application-application-created',
                title: 'Une nouvelle réutilisation a été créée',
              }, {
                const: 'application-error',
                title: 'Une réutilisation a rencontré une erreur',
              }, {
                const: 'application-publication',
                title: 'Une réutilisation a été publiée sur un catalogue',
              }],
            },
          },
          target: {
            type: 'object',
            required: ['type'],
            oneOf: [{
              title: 'Appel HTTP simple (compatible avec Slack et Mattermost)',
              properties: {
                type: {
                  const: 'http',
                  title: 'Type de cible',
                },
                params: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: {
                      type: 'string',
                      title: 'URL du serveur HTTP cible',
                    },
                  },
                },
              },
            }, {
              title: 'Google Analytics',
              properties: {
                type: {
                  const: 'ga',
                },
                params: {
                  type: 'object',
                  required: ['trackingId'],
                  properties: {
                    trackingId: {
                      type: 'string',
                      title: '(GA) Identifiant du tracker',
                    },
                    appName: {
                      type: 'string',
                      default: '',
                      title: "(GA) Nom de l'application",
                    },
                    appVersion: {
                      type: 'string',
                      default: '',
                      title: "(GA) Version de l'application",
                    },
                  },
                },
              },
            }],
          },
        },
      },
    },
    licenses: {
      type: 'array',
      description: 'List of licenses',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'href'],
        properties: {
          title: {
            type: 'string',
            description: 'Short title for the license',
          },
          href: {
            type: 'string',
            description: 'The URL where the license can be read',
          },
        },
      },
    },
    apiKeys: {
      type: 'array',
      description: 'Lis of API keys',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: {
            type: 'string',
          },
          key: {
            type: 'string',
          },
          scopes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          adminMode: {
            type: 'boolean',
            default: false,
          },
        },
      },
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic,
    },
    publicationSites: {
      type: 'array',
      title: 'Sites de publication',
      items: {
        type: 'object',
        required: ['type', 'id'],
        properties: {
          type: {
            type: 'string',
            description: 'A type of publication site, used to separate management of different types. Example: "data-fair-portals".',
          },
          id: {
            type: 'string',
            description: 'Id should be unique for a specific type',
          },
          url: {
            type: 'string',
            description: 'Used to link back to the root of the publication site',
          },
          onlyPublic: {
            type: 'boolean',
            description: 'This site will only accept resources that were previously opened to anonymous users',
          },
          datasetUrlTemplate: {
            type: 'string',
            description: 'Example: http://my-portal/datasets/{id}',
          },
          applicationUrlTemplate: {
            type: 'string',
            description: 'Example: http://my-portal/applications/{id}',
          },
        },
      },
    },
    operationsPermissions: {
      type: 'object',
      deprecated: true,
    },
  },
}
