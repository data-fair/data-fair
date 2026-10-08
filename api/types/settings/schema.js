import _publicationSites from '../../contract/publication-sites.js'
const publicationSites = _publicationSites()

// the two default tabs of the dataset metadata form, never stored in datasetsMetadata.groups
const informationsGroup = { key: 'informations', title: 'Informations' }
const coverageGroup = { key: 'coverage', title: 'Couverture & indexation' }

// tab of a metadata in the dataset form, left empty it stays in its default tab
/** @param {{ key: string, title: string }} defaultGroup */
const metadataGroup = (defaultGroup, toggleable = false, cols = 4) => ({
  type: 'string',
  title: 'Catégorie',
  // read by the dataset form, not a json schema default: vjsf would store it
  'x-default': defaultGroup.key,
  layout: {
    ...(toggleable && { if: 'parent.data.active' }),
    cols,
    getItems: {
      expr: `[${JSON.stringify(informationsGroup)}, ${JSON.stringify(coverageGroup)}].concat(rootData.groups ?? [])`,
      itemTitle: 'item.title',
      itemKey: 'item.key'
    },
    props: { placeholder: defaultGroup.title, persistentPlaceholder: true, clearable: true }
  }
})

// a metadata always shown on a dataset: only its tab can be chosen
/**
 * @param {string} title
 * @param {{ key: string, title: string }} defaultGroup
 * @param {string} description
 */
const fixedMetadata = (title, defaultGroup, description) => ({
  type: 'object',
  // an empty middle column, where the other rows have their custom label, keeps the help next to the switch
  layout: { children: ['active', { text: '\u00a0', cols: 4 }, 'group'] },
  properties: {
    active: { title, description, type: 'boolean', readOnly: true, default: true, layout: { comp: 'switch', cols: 4 } },
    group: metadataGroup(defaultGroup)
  }
})

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
                title: 'A new dataset has been created',
                'x-i18n-title': { fr: 'Un nouveau jeu de données a été créé' }
              }, {
                const: 'dataset-draft-data-updated',
                title: 'Dataset data has been updated in draft mode',
                'x-i18n-title': { fr: 'Les données d\'un jeu de données ont été mises à jour en mode brouillon' }
              }, {
                const: 'dataset-data-updated',
                title: 'Dataset data has been updated',
                'x-i18n-title': { fr: 'Les données d\'un jeu de données ont été mises à jour' }
              }, {
                const: 'dataset-structure-updated',
                title: 'A dataset schema has been updated',
                'x-i18n-title': { fr: 'La structure d\'un jeu de données a été mise à jour' }
              }, {
                const: 'dataset-error',
                title: 'A dataset has encountered an error',
                'x-i18n-title': { fr: 'Un jeu de données a rencontré une erreur' }
              }, {
                const: 'dataset-breaking-change',
                title: 'A dataset has a breaking change',
                'x-i18n-title': { fr: 'Un jeu de données rencontre une rupture de compatibilité' }
              }, {
                const: 'dataset-finalize-end',
                title: 'A dataset has been finalized',
                'x-i18n-title': { fr: 'Un jeu de données a été finalisé' }
              }, {
                const: 'dataset-integrity-breach',
                title: 'L\'intégrité d\'un jeu de données est rompue'
              }, {
                const: 'dataset-integrity-trail-altered',
                title: 'L\'historique de révisions d\'un jeu de données est altéré'
              }, {
                const: 'application-application-created',
                title: 'A new visualization has been created',
                'x-i18n-title': { fr: 'Une nouvelle visualisation a été créée' }
              }, {
                const: 'application-error',
                title: 'A visualization has encountered an error',
                'x-i18n-title': { fr: 'Une visualisation a rencontré une erreur' }
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
          },
          notifiedJ3At: {
            type: 'string',
            format: 'date-time',
            readOnly: true,
            description: 'Internal — timestamp set when the J-3 expiration notification was emitted. Not user-writable.'
          },
          notifiedJAt: {
            type: 'string',
            format: 'date-time',
            readOnly: true,
            description: 'Internal — timestamp set when the J-day expiration notification was emitted. Not user-writable.'
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
        listEditMode: 'inline',
        listActions: ['add', 'delete', 'sort'],
        messages: {
          addItem: 'Add a topic',
          'x-i18n-addItem': {
            fr: 'Ajouter une thématique'
          }
        }
      },
      items: { $ref: 'https://github.com/data-fair/data-fair/topic' }
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
          addItem: 'Add a concept',
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
          switch: [{
            if: 'summary',
            children: []
          }]
        },
        properties: {
          id: {
            type: 'string',
            title: 'Identifiant',
            readOnly: true,
            layout: {
              if: { type: 'js-eval', expr: 'parent.data.id', pure: false }
            }
          },
          identifiers: {
            type: 'array',
            layout: 'none',
            items: {
              type: 'string',
              title: 'Identifiant vocabulaire extérieur',
              description: 'Renseignez idéalement une URI issue d\'un vocabulaire standardisé comme schema.org, c\'est à dire un identifiant mondialement unique pour ce concept. Si ce n\'est pas possible vous pouvez laisser cette information vide.'
            }
          },
          title: { type: 'string', title: 'Titre', minLength: 3 },
          description: { type: 'string', title: 'Description' },
          tag: { type: 'string', title: 'Catégorie' },
          type: { type: 'string', title: 'Type', default: 'string', oneOf: [{ title: 'Chaîne de caractère', const: 'string' }, { title: 'Nombre', const: 'number' }] }
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
        groups: {
          type: 'array',
          title: 'Catégories',
          description: 'Onglets ajoutés au formulaire des métadonnées, après « Informations » et « Couverture & indexation ».',
          layout: {
            listEditMode: 'inline',
            listActions: ['add', 'delete', 'sort'],
            messages: {
              addItem: 'Add a category',
              'x-i18n-addItem': {
                fr: 'Ajouter une catégorie'
              }
            }
          },
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              key: {
                type: 'string',
                readOnly: true,
                layout: 'none'
              },
              title: {
                title: "Titre de l'onglet",
                type: 'string',
                minLength: 3,
                // the icon below comes from the topic schema, 5 columns wide
                layout: { cols: { md: 7, sm: 6 } }
              },
              icon: { $ref: 'https://github.com/data-fair/data-fair/topic#/properties/icon' }
            }
          }
        },
        license: fixedMetadata('Licence', informationsGroup, "Conditions de réutilisation des données. La liste des licences proposées se règle dans l'onglet Licences."),
        origin: fixedMetadata('Provenance', informationsGroup, "Adresse de la page où les données d'origine sont publiées, par exemple sur le site du producteur."),
        image: fixedMetadata('Vignette', informationsGroup, "Adresse d'une image utilisée comme vignette du jeu de données, dans les listes et sur les portails."),
        topics: fixedMetadata('Thématiques', coverageGroup, 'Thématiques définies dans la section Thématiques des paramètres. Elles servent à classer et à filtrer les jeux de données sur les portails.'),
        relatedDatasets: fixedMetadata('Jeux de données liés', coverageGroup, "Sélectionnez d'autres jeux de données proches (même thématique, structure similaire, ou autre critère) pour les proposer aux utilisateurs de portails."),
        creator: {
          type: 'object',
          properties: {
            active: {
              title: 'Producteur',
              description: "Organisation ou personne qui a produit les données, quand ce n'est pas le propriétaire du jeu de données.",
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Producteur' }
              }
            },
            group: metadataGroup(informationsGroup, true)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
        spatial: {
          type: 'object',
          properties: {
            active: {
              title: 'Couverture géographique',
              description: 'Zone géographique couverte par les données, par exemple une commune ou une région.',
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Couverture géographique' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_temporal
        temporal: {
          type: 'object',
          properties: {
            active: {
              title: 'Couverture temporelle',
              description: 'Période couverte par les données.',
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Couverture temporelle' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_frequency and https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
        frequency: {
          type: 'object',
          properties: {
            active: {
              title: 'Fréquence de mise à jour',
              description: 'Fréquence à laquelle les données sont mises à jour.',
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Fréquence de mise à jour' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        modified: {
          type: 'object',
          properties: {
            active: {
              title: 'Date de modification de la source',
              description: "Date à laquelle les données ont été modifiées à leur source, quand elle diffère de leur date de chargement dans Data Fair. Elle sert au tri des jeux de données par date de mise à jour, notamment sur les portails : laissée vide, c'est la date de la dernière mise à jour des données qui est utilisée.",
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Date de modification de la source' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        keywords: {
          type: 'object',
          properties: {
            active: {
              title: 'Mots-clés',
              description: 'Mots libres qui décrivent le jeu de données, utilisés par la recherche et les filtres des portails.',
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Mots-clés' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        searchTerms: {
          type: 'object',
          properties: {
            active: {
              title: 'Termes de recherche associés',
              description: "Texte libre utilisé uniquement par la recherche du catalogue, jamais affiché : synonymes, sigles et leur développement, formulations courantes. Ce champ n'est affiché nulle part mais reste présent dans la réponse API publique du jeu de données : n'y mettez rien de confidentiel.",
              type: 'boolean',
              default: true,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Termes de recherche associés' }
              }
            },
            group: metadataGroup(coverageGroup, true)
          }
        },
        conformsTo: {
          type: 'object',
          properties: {
            active: {
              title: 'Schéma',
              description: 'Schéma de données auquel le jeu de données est conforme, par exemple un schéma publié sur schema.data.gouv.fr. Il se renseigne dans la section Structure du jeu de données.',
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 4,
                props: { variant: 'outlined', placeholder: 'Schéma' }
              }
            }
          }
        },
        custom: {
          type: 'array',
          title: 'Métadonnées personnalisées',
          layout: {
            messages: {
              addItem: 'Add a custom metadata',
              'x-i18n-addItem': {
                fr: 'Ajouter une métadonnée'
              }
            },
            itemTitle: 'item.title',
            itemSubtitle: `[item.key && "Clé : " + item.key, "Catégorie : " + ([${JSON.stringify(informationsGroup)}, ${JSON.stringify(coverageGroup)}].concat(rootData.groups ?? []).find(g => g.key === item.group) ?? ${JSON.stringify(informationsGroup)}).title].filter(Boolean).join(" · ")`
          },
          items: {
            type: 'object',
            required: ['title'],
            layout: {
              switch: [{
                if: 'summary',
                children: []
              }]
            },
            properties: {
              key: {
                title: 'Clé',
                type: 'string',
                readOnly: true,
                layout: 'none'
              },
              title: {
                title: 'Libellé',
                type: 'string',
                minLength: 3,
                layout: { cols: 6 }
              },
              group: metadataGroup(informationsGroup, false, 6),
              description: {
                title: 'Infobulle',
                description: "Texte d'aide affiché à côté du champ, dans le formulaire du jeu de données.",
                type: 'string',
                layout: 'textarea'
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
    },
    agentChat: {
      type: 'boolean',
      title: 'AI assistant',
      description: 'Active l\'assistant IA',
      default: false
    }
  }
}
