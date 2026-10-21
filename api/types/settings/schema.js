import _publicationSites from '../../contract/publication-sites.js'
const publicationSites = _publicationSites()

// the two default tabs of the dataset metadata form, never stored in datasetsMetadata.groups
const informationsGroup = { key: 'informations', title: 'Informations générales' }
const coverageGroup = { key: 'coverage', title: 'Informations complémentaires' }
// their titles can be overridden by datasetsMetadata.informationsTitle and coverageTitle
const allGroupsExpr = `[{ key: "informations", title: rootData.informationsTitle || ${JSON.stringify(informationsGroup.title)} }, { key: "coverage", title: rootData.coverageTitle || ${JSON.stringify(coverageGroup.title)} }].concat(rootData.groups ?? [])`

// tab of a metadata in the dataset form, left empty it stays in its default tab
/** @param {{ key: string, title: string }} defaultGroup */
const metadataGroup = (defaultGroup, toggleable = false, cols = 3) => ({
  type: 'string',
  title: 'Catégorie',
  // read by the dataset form, not a json schema default: vjsf would store it
  'x-default': defaultGroup.key,
  layout: {
    ...(toggleable && { if: 'parent.data.active' }),
    cols,
    getItems: {
      expr: allGroupsExpr,
      itemTitle: 'item.title',
      itemKey: 'item.key'
    },
    props: { placeholder: defaultGroup.title, persistentPlaceholder: true, clearable: true }
  }
})

const scoreActive = 'rootData.completeness?.active'
const toggleableScore = `parent.data.active && ${scoreActive}`
// weight, min and max end the row of their metadata on wide screens
const scoreCols = { xs: 4, lg: 1 }
/**
 * @param {string} title
 * @param {number | undefined} value
 * @param {string} ifExpr
 * @param {Record<string, any>} [props]
 * @param {string} [getProps]
 * @param {Record<string, number>} [cols]
 */
const scoreField = (title, value, ifExpr, props, getProps, cols = scoreCols) => ({
  type: 'integer',
  minimum: 0,
  title,
  'x-default': value,
  layout: {
    if: ifExpr,
    cols,
    props: { controlVariant: 'hidden', ...props, ...(value !== undefined && { placeholder: String(value), persistentPlaceholder: true }) },
    ...(getProps && { getProps })
  }
})
/** @typedef {{ unit: string, min?: number, max?: number }} Bounds */
// weight of a metadata in the completeness score, and for a text or a list its recommended size
// x-default is read by the score, not a json schema default: vjsf would store it
/**
 * @param {number} weight
 * @param {string} ifExpr
 * @param {Bounds} [bounds]
 */
const scoreProperties = (weight, ifExpr, bounds) => ({
  weight: scoreField('Poids', weight, ifExpr),
  ...(bounds && {
    recommendedMin: scoreField('Min.', bounds.min, ifExpr, { suffix: bounds.unit }),
    recommendedMax: scoreField('Max.', bounds.max, ifExpr, { suffix: bounds.unit })
  })
})
const chars = 'car.'
const values = 'val.'
const textType = '(parent.data?.type ?? "string") === "string"'
// a single value picked in a list has no size to recommend
const customBounds = `${scoreActive} && ${textType} && (parent.data?.multiple || !parent.data?.enum?.length)`

// a metadata always shown on a dataset: only its tab can be chosen, except for summary and description
/**
 * @param {string} title
 * @param {{ key: string, title: string }} defaultGroup
 * @param {string} description
 * @param {number} weight
 * @param {Bounds} [bounds]
 * @param {boolean} [fixedGroup]
 */
const fixedMetadata = (title, defaultGroup, description, weight, bounds, fixedGroup = false) => ({
  type: 'object',
  // an empty middle column, where the other rows have their custom label, keeps the help next to the switch
  layout: { children: ['active', { text: '\u00a0', cols: 3 }, 'group', 'weight', ...(bounds ? ['recommendedMin', 'recommendedMax'] : [])] },
  properties: {
    active: { title, description, type: 'boolean', readOnly: true, default: true, layout: { comp: 'switch', cols: 3 } },
    group: fixedGroup ? { ...metadataGroup(defaultGroup), readOnly: true } : metadataGroup(defaultGroup),
    ...scoreProperties(weight, scoreActive, bounds)
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
        informationsTitle: {
          type: 'string',
          title: 'Titre du premier onglet',
          layout: { cols: 6, props: { placeholder: informationsGroup.title, persistentPlaceholder: true } }
        },
        coverageTitle: {
          type: 'string',
          title: 'Titre du deuxième onglet',
          layout: { cols: 6, props: { placeholder: coverageGroup.title, persistentPlaceholder: true } }
        },
        groups: {
          type: 'array',
          title: 'Catégories',
          description: 'Onglets ajoutés au formulaire des métadonnées, après les deux premiers.',
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
        completeness: {
          type: 'object',
          properties: {
            active: {
              type: 'boolean',
              title: 'Activer le score de complétion des métadonnées',
              description: 'Calcule sur chaque jeu de données un score de 0 à 100. Chaque métadonnée renseignée rapporte son poids, ou la moitié seulement si sa taille sort du minimum et du maximum recommandés. Une métadonnée de poids 0 ne compte pas.',
              default: false,
              layout: { comp: 'switch' }
            }
          }
        },
        summary: fixedMetadata('Résumé', informationsGroup, 'Courte présentation du jeu de données, affichée dans les listes et sur les vignettes des portails.', 3, { unit: chars, min: 100, max: 300 }, true),
        // Google Dataset rich results expect a description of 50 to 5000 characters
        description: fixedMetadata('Description', informationsGroup, 'Présentation détaillée du jeu de données, rédigée en markdown.', 4, { unit: chars, min: 500, max: 5000 }, true),
        license: fixedMetadata('Licence', informationsGroup, "Conditions de réutilisation des données. La liste des licences proposées se règle dans l'onglet Licences.", 3),
        origin: fixedMetadata('Provenance', informationsGroup, "Adresse de la page où les données d'origine sont publiées, par exemple sur le site du producteur.", 1),
        image: fixedMetadata('Vignette', coverageGroup, "Adresse d'une image utilisée comme vignette du jeu de données, dans les listes et sur les portails.", 0),
        topics: fixedMetadata('Thématiques', informationsGroup, 'Thématiques définies dans la section Thématiques des paramètres. Elles servent à classer et à filtrer les jeux de données sur les portails.', 2, { unit: values }),
        relatedDatasets: fixedMetadata('Jeux de données liés', coverageGroup, "Sélectionnez d'autres jeux de données proches (même thématique, structure similaire, ou autre critère) pour les proposer aux utilisateurs de portails.", 0, { unit: values }),
        creator: {
          type: 'object',
          properties: {
            active: {
              title: 'Producteur',
              description: "Organisation ou personne qui a produit les données, quand ce n'est pas le propriétaire du jeu de données.",
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Producteur' }
              }
            },
            group: metadataGroup(informationsGroup, true),
            ...scoreProperties(2, toggleableScore)
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Couverture géographique' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(1, toggleableScore)
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Couverture temporelle' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(1, toggleableScore)
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Fréquence de mise à jour' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(1, toggleableScore)
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Date de modification de la source' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(0, toggleableScore)
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Mots-clés' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(2, toggleableScore, { unit: values })
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
              layout: { comp: 'switch', cols: 3 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 3,
                props: { variant: 'outlined', placeholder: 'Termes de recherche associés' }
              }
            },
            group: metadataGroup(coverageGroup, true),
            ...scoreProperties(0, toggleableScore)
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
            // a copy gets its own key, generated from its title on save
            itemCopy: '{ ...item, key: undefined }',
            itemTitle: 'item.title',
            itemSubtitle: `[item.key && "Clé : " + item.key, ({ string: "Texte", integer: "Nombre entier", number: "Nombre", date: "Date", link: "Lien" })[item.type ?? "string"] + (item.enum?.length ? ", liste de valeurs" : "") + (item.multiple ? ", plusieurs valeurs" : ""), "Catégorie : " + (${allGroupsExpr}.find(g => g.key === item.group) ?? ${allGroupsExpr}[0]).title].filter(Boolean).join(" · ")`
          },
          items: {
            type: 'object',
            required: ['title'],
            layout: {
              switch: [{
                if: 'summary',
                children: []
              }, {
                // the weight takes the room of min and max when a metadata has none
                children: [
                  'title', 'type', 'group',
                  { key: 'weight', cols: { xs: 12, lg: 1 }, if: customBounds },
                  { key: 'weight', cols: { xs: 12, lg: 3 }, if: `${scoreActive} && !(${customBounds})` },
                  'recommendedMin', 'recommendedMax', 'enum', 'multiple', 'description'
                ]
              }]
            },
            properties: {
              key: {
                title: 'Clé',
                type: 'string',
                readOnly: true,
                layout: 'none'
              },
              // label, type and category then the score, in line with the other metadata rows
              title: {
                title: 'Libellé',
                type: 'string',
                minLength: 3,
                layout: { cols: 3 }
              },
              type: {
                title: 'Type',
                type: 'string',
                default: 'string',
                layout: { cols: 3 },
                oneOf: [
                  { const: 'string', title: 'Texte' },
                  { const: 'integer', title: 'Nombre entier' },
                  { const: 'number', title: 'Nombre' },
                  { const: 'date', title: 'Date' },
                  { const: 'link', title: 'Lien (URL et libellé)' }
                ]
              },
              group: metadataGroup(informationsGroup, false, 3),
              weight: scoreField('Poids', 1, scoreActive, {}, undefined, { xs: 12, lg: 3 }),
              // the options of a text, then the size recommended for its values
              enum: {
                title: 'Liste de valeurs',
                description: 'Laissez vide pour une saisie libre.',
                type: 'array',
                items: { type: 'string' },
                layout: { cols: { xs: 12, lg: 9 }, if: textType }
              },
              multiple: {
                title: 'Plusieurs valeurs',
                type: 'boolean',
                layout: { cols: { xs: 12, lg: 3 }, comp: 'checkbox', if: textType }
              },
              ...Object.fromEntries(['recommendedMin', 'recommendedMax'].map((key, i) => [key, scoreField(
                ['Min.', 'Max.'][i],
                undefined,
                customBounds,
                {},
                `({ ...layout.props, suffix: parent.data?.multiple ? ${JSON.stringify(values)} : ${JSON.stringify(chars)} })`,
                { xs: 6, lg: 1 }
              )])),
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
    },
    agentChatAudience: {
      type: 'array',
      title: 'AI assistant audience',
      description: 'Restreint l\'assistant IA aux membres correspondant à l\'une de ces règles. Vide : tous les membres.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['department'],
        properties: {
          department: {
            type: 'string',
            description: 'Identifiant du département, "*" pour tous les départements ou "-" pour l\'organisation principale seulement'
          },
          roles: {
            type: 'array',
            description: 'Rôles concernés, tous si vide',
            items: { type: 'string' }
          }
        }
      }
    }
  }
}
