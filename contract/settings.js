const topic = require('./topic')
const publicationSites = require('./publication-sites')()

module.exports = {
  title: 'Settings',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type'],
  properties: {
    id: {
      type: 'string',
      description: 'Identifier of the owner of this settings'
    },
    type: {
      type: 'string',
      enum: ['user', 'organization'],
      description: 'If the owner is a user or an organization'
    },
    name: {
      type: 'string',
      description: 'The name of the owner'
    },
    info: {
      type: 'object',
      properties: {
        contact: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
              title: 'Nom'
            },
            url: {
              type: 'string',
              title: 'URL'
            },
            email: {
              type: 'string',
              title: 'Email'
            }
          }
        }
      }
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
            title: 'Titre'
          },
          events: {
            type: 'array',
            title: 'Événements déclencheurs',
            items: {
              type: 'string',
              oneOf: [{
                const: 'dataset-dataset-created',
                title: 'Un nouveau jeu de données a été créé'
              }, {
                const: 'dataset-draft-data-updated',
                title: 'Le fichier d\'un jeu de données a été mis à jour en mode brouillon'
              }, {
                const: 'dataset-data-updated',
                title: 'Le fichier d\'un jeu de données a été mis à jour'
              }, {
                const: 'dataset-error',
                title: 'Un jeu de données a rencontré une erreur'
              }, {
                const: 'dataset-breaking-change',
                title: 'Un jeu de données rencontre une rupture de compatibilité'
              }, {
                const: 'dataset-finalize-end',
                title: 'Un jeu de données a été finalisé'
              }, {
                const: 'dataset-publication',
                title: 'Un jeu de données a été publié sur un catalogue'
              }, {
                const: 'application-application-created',
                title: 'Une nouvelle visualisation a été créée'
              }, {
                const: 'application-error',
                title: 'Une visualisation a rencontré une erreur'
              }, {
                const: 'application-publication',
                title: 'Une visualisation a été publiée sur un catalogue'
              }]
            }
          },
          target: {
            type: 'object',
            required: ['type'],
            oneOf: [{
              title: 'Appel HTTP simple (compatible avec Slack et Mattermost)',
              properties: {
                type: {
                  const: 'http',
                  title: 'Type de cible'
                },
                params: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: {
                      type: 'string',
                      title: 'URL du serveur HTTP cible'
                    }
                  }
                }
              }
            } /*, {
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
            } */]
          }
        }
      }
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
            description: 'Short title for the license'
          },
          href: {
            type: 'string',
            description: 'The URL where the license can be read'
          }
        }
      }
    },
    apiKeys: {
      type: 'array',
      description: 'List of API keys',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          id: {
            type: 'string'
          },
          title: {
            type: 'string'
          },
          key: {
            type: 'string'
          },
          scopes: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          adminMode: {
            type: 'boolean',
            default: false
          },
          asAccount: {
            type: 'boolean',
            default: false
          }
        }
      }
    },
    topics: {
      type: 'array',
      title: 'Liste de thématiques',
      'x-itemTitle': 'title',
      items: topic
    },
    publicationSites,
    operationsPermissions: {
      type: 'object',
      deprecated: true
    },
    privateVocabulary: {
      type: 'array',
      title: 'Vocabulaire privé',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            title: 'Identifiant',
            description: 'Saisissez une chaine de caractère courte et non ambigue.'
          },
          identifiers: {
            type: 'array',
            items: [{
              type: 'string',
              title: 'Identifiant',
              description: 'Renseignez idéalement une URI issue d\'un vocabulaire standardisé, c\'est à dire un identifiant mondialement unique pour ce concept. Si ce n\'est pas possible vous pouvez laisser cette information vide.'
            }]
          },
          title: { type: 'string', title: 'Titre' },
          description: { type: 'string', title: 'Description' },
          tag: { type: 'string', title: 'Catégorie' },
          type: { type: 'string', const: 'string' }
        }
      }
    },
    datasetsMetadata: {
      type: 'object',
      title: 'Options des métadonnées de jeux de données',
      properties: {
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
        spatial: {
          type: 'object',
          'x-cols': 6,
          properties: {
            active: {
              title: 'couverture géographique',
              type: 'boolean',
              default: false,
              'x-cols': 12
            }
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_temporal
        temporal: {
          type: 'object',
          properties: {
            active: {
              title: 'couverture temporelle',
              type: 'boolean',
              default: false

            }
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_frequency and https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
        frequency: {
          type: 'object',
          properties: {
            active: {
              title: 'fréquence de mise à jour',
              type: 'boolean',
              default: false
            }
          }
        },
        keywords: {
          type: 'object',
          properties: {
            active: {
              title: 'mots clés',
              type: 'boolean',
              default: false
            }
          }
        }
      }
    }
  }
}
