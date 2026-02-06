import _publicationSites from '../../contract/publication-sites.js'
const publicationSites = _publicationSites()

export default {
  $id: 'https://github.com/data-fair/data-fair/settings',
  title: 'Settings',
  'x-exports': ['types', 'resolvedSchema', 'validate'],
  type: 'object',
  required: ['id', 'type'],
  additionalProperties: false,
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
    email: {
      type: 'string',
      description: 'The email associated to the owner'
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
      title: 'Webhooks',
      layout: {
        title: '',
        messages: {
          addItem: 'Add a webhook',
          'x-i18n-addItem': {
            fr: 'Ajouter un webhook'
          }
        },
        itemTitle: 'item.title'
      },
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'events', 'target'],
        layout: {
          switch: [{
            if: 'summary',
            children: []
          }]
        },
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            'x-i18n-title': {
              fr: 'Titre'
            }
          },
          events: {
            type: 'array',
            title: 'Events',
            'x-i18n-title': {
              fr: 'Événements déclencheurs'
            },
            minItems: 1,
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
                const: 'dataset-structure-updated',
                title: 'La structure d\'un jeu de données a été mise à jour'
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
            }]
          }
        }
      }
    },
    licenses: {
      type: 'array',
      title: 'Licenses',
      'x-i18n-title': {
        fr: 'Licences',
      },
      layout: {
        title: '',
        messages: {
          addItem: 'Add a license',
          'x-i18n-addItem': {
            fr: 'Ajouter une licence'
          }
        },
        itemTitle: 'item.title'
      },
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'href'],
        layout: {
          switch: [{
            if: 'summary',
            children: []
          }]
        },
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            'x-i18n-title': {
              fr: 'Titre'
            }
          },
          href: {
            type: 'string',
            title: 'URL',
            'x-i18n-title': {
              fr: 'URL'
            },
            description: 'The URL where the license can be read',
            'x-i18n-description': {
              fr: 'L\'URL où la licence peut être lue'
            }
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
        required: ['title', 'scopes'],
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
          email: {
            type: 'string'
          },
          scopes: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          expireAt: {
            type: 'string',
            format: 'date'
          },
          adminMode: {
            type: 'boolean',
            default: false
          },
          asAccount: {
            type: 'boolean',
            default: false
          },
          clearKey: {
            type: 'string'
          }
        }
      }
    },
    topics: {
      type: 'array',
      title: 'Topics',
      'x-i18n-title': {
        fr: 'Thématiques'
      },
      layout: {
        title: '',
        messages: {
          addItem: 'Add a topic',
          'x-i18n-addItem': {
            fr: 'Ajouter une thématique'
          }
        },
        itemTitle: 'item.title'
      },
      items: {
        $ref: 'https://github.com/data-fair/data-fair/topic'
      }
    },
    publicationSites,
    operationsPermissions: {
      type: 'object',
      deprecated: true
    },
    privateVocabulary: {
      type: 'array',
      title: 'Private vocabulary',
      'x-i18n-title': {
        fr: 'Vocabulaire privé'
      },
      layout: {
        title: '',
        messages: {
          addItem: 'Add a topic',
          'x-i18n-addItem': {
            fr: 'Ajouter un concept'
          }
        },
        itemTitle: 'item.title'
      },
      items: {
        type: 'object',
        required: ['title'],
        layout: {
          title: '',
          messages: {
            addItem: 'Add a license',
            'x-i18n-addItem': {
              fr: 'Ajouter une licence'
            }
          },
          itemTitle: 'item.title'
        },
        properties: {
          id: {
            type: 'string',
            title: 'Identifiant',
            'x-if': 'parent.value.id',
            readOnly: true
          },
          identifiers: {
            type: 'array',
            'x-display': 'hidden',
            items: {
              type: 'string',
              title: 'Identifiant vocabulaire extérieur',
              description: 'Renseignez idéalement une URI issue d\'un vocabulaire standardisé comme schema.org, c\'est à dire un identifiant mondialement unique pour ce concept. Si ce n\'est pas possible vous pouvez laisser cette information vide.'
            }
          },
          title: { type: 'string', title: 'Titre', minLength: 3 },
          description: { type: 'string', title: 'Description' },
          tag: { type: 'string', title: 'Catégorie' },
          type: { type: 'string', default: 'string', oneOf: [{ title: 'chaîne de caractère', const: 'string' }, { title: 'nombre', const: 'number' }] }
        }
      }
    },
    datasetsMetadata: {
      type: 'object',
      title: 'Options des métadonnées de jeux de données',
      layout: {
        title: null
      },
      properties: {
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
        spatial: {
          type: 'object',
          properties: {
            active: {
              title: 'couverture géographique',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Couverture géographique' }
              }
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
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Couverture temporelle' }
              }
            }
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_frequency and https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
        frequency: {
          type: 'object',
          properties: {
            active: {
              title: 'fréquence des mises à jour',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Fréquence des mises à jour' }
              }
            }
          }
        },
        creator: {
          type: 'object',
          properties: {
            active: {
              title: 'personne ou organisme créateur',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Personne ou organisme créateur' }
              }
            }
          }
        },
        modified: {
          type: 'object',
          properties: {
            active: {
              title: 'date de dernière modification de la source',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Date de dernière modification de la source' }
              }
            }
          }
        },
        keywords: {
          type: 'object',
          properties: {
            active: {
              title: 'mots clés',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Mots clés' }
              }
            }
          }
        },
        custom: {
          type: 'array',
          title: 'Métadonnées spécifiques',
          layout: {
            messages: {
              addItem: 'Add a custom metadata',
              'x-i18n-addItem': {
                fr: 'Ajouter une nouvelle métadonnée'
              }
            }
          },
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              key: {
                title: 'clé',
                type: 'string',
                readOnly: true,
                layout: {
                  if: 'summary'
                }
              },
              title: {
                title: 'libellé',
                type: 'string',
                minLength: 3
              }
            }
          }
        }
      }
    },
    compatODS: {
      type: 'boolean',
      title: 'Compatibilité ODS',
      description: 'Active la compatibilité avec l\'API ODS',
      default: false
    }
  }
}
