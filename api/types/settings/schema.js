import _publicationSites from '../../contract/publication-sites.js'
const publicationSites = _publicationSites()

// the two default tabs of the dataset metadata form, never stored in datasetsMetadata.groups
const informationsGroup = { key: 'informations' }
const coverageGroup = { key: 'coverage' }
// their titles can be overridden by datasetsMetadata.informationsTitle and coverageTitle, context.labels holds the translated defaults
const allGroupsExpr = '[{ key: "informations", title: rootData.informationsTitle || context.labels.groups.informations }, { key: "coverage", title: rootData.coverageTitle || context.labels.groups.coverage }].concat(rootData.groups ?? [])'

// tab of a metadata in the dataset form, left empty it stays in its default tab
/** @param {{ key: string }} defaultGroup */
const metadataGroup = (defaultGroup, toggleable = false, cols = 4) => ({
  type: 'string',
  title: 'Category',
  'x-i18n-title': { fr: 'Catégorie' },
  // a fallback read by the code, the settings forms never write defaults (vjsf useDefault: false)
  default: defaultGroup.key,
  layout: {
    ...(toggleable && { if: 'parent.data.active' }),
    cols,
    getProps: `({ ...layout.props, placeholder: context.labels.groups.${defaultGroup.key} })`,
    getItems: {
      expr: allGroupsExpr,
      itemTitle: 'item.title',
      itemKey: 'item.key'
    },
    props: { persistentPlaceholder: true, clearable: true }
  }
})

/** @typedef {{ title: string, description: string, 'x-i18n-title': { fr: string }, 'x-i18n-description': { fr: string } }} MetadataTexts */
/**
 * title and description of a metadata switch, English in the base keywords and French in the x-i18n overrides
 * @param {string} title
 * @param {string} description
 * @param {string} titleFr
 * @param {string} descriptionFr
 * @returns {MetadataTexts}
 */
const metadataTexts = (title, description, titleFr, descriptionFr) => ({
  title,
  description,
  'x-i18n-title': { fr: titleFr },
  'x-i18n-description': { fr: descriptionFr }
})

// the custom label of an optional metadata, its default label as placeholder
/** @param {MetadataTexts} texts */
const metadataCustomTitle = (texts) => ({
  title: 'Custom label',
  'x-i18n-title': { fr: 'Libellé personnalisé' },
  type: 'string',
  layout: {
    if: 'parent.data.active',
    cols: 4,
    props: { variant: 'outlined', placeholder: texts.title, 'x-i18n-placeholder': texts['x-i18n-title'] }
  }
})

const scoreActive = 'rootData.completeness?.active'
const weightTitles = { title: 'Weight', 'x-i18n-title': { fr: 'Poids' } }
/**
 * @param {{ title: string, 'x-i18n-title'?: Record<string, string> }} titles
 * @param {number | undefined} value
 * @param {string} [ifExpr]
 * @param {Record<string, any>} [props]
 * @param {string} [getProps]
 * @param {number | Record<string, number>} [cols]
 */
const scoreField = (titles, value, ifExpr, props, getProps, cols) => ({
  type: 'integer',
  minimum: 0,
  ...titles,
  ...(value !== undefined && { default: value }),
  layout: {
    ...(ifExpr && { if: ifExpr }),
    ...(cols && { cols }),
    props: { controlVariant: 'hidden', ...props, ...(value !== undefined && { placeholder: String(value), persistentPlaceholder: true }) },
    ...(getProps && { getProps })
  }
})
/** @typedef {{ unit: string, min?: number, max?: number }} Bounds */
// weight of a metadata in the completeness score, and for a text or a list its recommended size
// the defaults are fallbacks read by the score, the settings forms never write them
// the unit is a key of context.labels.units
/**
 * @param {number} weight
 * @param {Bounds} [bounds]
 */
const scoreProperties = (weight, bounds) => ({
  weight: scoreField(weightTitles, weight),
  ...(bounds && {
    recommendedMin: scoreField({ title: 'Min.' }, bounds.min, undefined, { suffix: bounds.unit }),
    recommendedMax: scoreField({ title: 'Max.' }, bounds.max, undefined, { suffix: bounds.unit })
  })
})
const chars = 'chars'
const values = 'values'
const textType = '(parent.data?.type ?? "string") === "string"'
// a single value picked in a list has no size to recommend
const customBounds = `${scoreActive} && ${textType} && (parent.data?.multiple || !parent.data?.enum?.length)`

// a help is a sentence or two: two lines to start with, more as it is typed
const helpProps = { rows: 2, autoGrow: true }

// replaces the help shown next to the field in the dataset form, the form gives the native help as placeholder
const metadataHelp = (toggleable = false) => ({
  type: 'string',
  title: 'Tooltip',
  'x-i18n-title': { fr: 'Infobulle' },
  description: 'Help text shown next to the field, in the dataset form.',
  'x-i18n-description': { fr: "Texte d'aide affiché à côté du champ, dans le formulaire du jeu de données." },
  layout: {
    comp: 'textarea',
    ...(toggleable && { if: 'parent.data.active' }),
    cols: 12,
    props: helpProps
  }
})

// a metadata always shown on a dataset: its tab can be chosen, except for summary and description, and its help
/**
 * @param {MetadataTexts} texts
 * @param {{ key: string }} defaultGroup
 * @param {number} weight
 * @param {Bounds} [bounds]
 * @param {boolean} [fixedGroup]
 */
const fixedMetadata = (texts, defaultGroup, weight, bounds, fixedGroup = false) => ({
  type: 'object',
  // an empty middle column, where the other rows have their custom label, keeps the help next to the switch
  layout: { children: ['active', { text: '\u00a0', cols: 4 }, 'group', 'description'] },
  properties: {
    active: { ...texts, type: 'boolean', readOnly: true, default: true, layout: { comp: 'switch', cols: 4 } },
    group: fixedGroup ? { ...metadataGroup(defaultGroup), readOnly: true } : metadataGroup(defaultGroup),
    description: metadataHelp(),
    ...scoreProperties(weight, bounds)
  }
})

// texts of the optional metadata, shared by their switch and the placeholder of their custom label
const optionalTexts = {
  creator: metadataTexts('Producer', 'Organization or person who produced the data, when it is not the owner of the dataset.', 'Producteur', "Organisation ou personne qui a produit les données, quand ce n'est pas le propriétaire du jeu de données."),
  spatial: metadataTexts('Geographic coverage', 'Geographic area covered by the data, for example a municipality or a region.', 'Couverture géographique', 'Zone géographique couverte par les données, par exemple une commune ou une région.'),
  temporal: metadataTexts('Temporal coverage', 'Period covered by the data.', 'Couverture temporelle', 'Période couverte par les données.'),
  frequency: metadataTexts('Update frequency', 'How often the data is updated.', 'Fréquence de mise à jour', 'Fréquence à laquelle les données sont mises à jour.'),
  modified: metadataTexts('Source modification date', 'Date the data was modified at its source, when it differs from the date it was loaded into Data Fair. It is used to sort datasets by update date, on portals in particular: left empty, the date of the last data update is used.', 'Date de modification de la source', "Date à laquelle les données ont été modifiées à leur source, quand elle diffère de leur date de chargement dans Data Fair. Elle sert au tri des jeux de données par date de mise à jour, notamment sur les portails : laissée vide, c'est la date de la dernière mise à jour des données qui est utilisée."),
  keywords: metadataTexts('Keywords', 'Free words describing the dataset, used by the search and filters of portals.', 'Mots-clés', 'Mots libres qui décrivent le jeu de données, utilisés par la recherche et les filtres des portails.'),
  searchTerms: metadataTexts('Associated search terms', 'Free text used only by the catalog search, never displayed: synonyms, acronyms with their expansion, everyday wording. This field is shown nowhere but remains in the public API response of the dataset: do not put anything confidential in it.', 'Termes de recherche associés', "Texte libre utilisé uniquement par la recherche du catalogue, jamais affiché : synonymes, sigles et leur développement, formulations courantes. Ce champ n'est affiché nulle part mais reste présent dans la réponse API publique du jeu de données : n'y mettez rien de confidentiel."),
  conformsTo: metadataTexts('Schema', 'Data schema the dataset conforms to, for example a schema published on schema.data.gouv.fr. It is set in the Structure section of the dataset.', 'Schéma', 'Schéma de données auquel le jeu de données est conforme, par exemple un schéma publié sur schema.data.gouv.fr. Il se renseigne dans la section Structure du jeu de données.')
}

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
              title: 'Name',
              'x-i18n-title': { fr: 'Nom' }
            },
            url: {
              type: 'string',
              title: 'URL',
              'x-i18n-title': { fr: 'URL' }
            },
            email: {
              type: 'string',
              title: 'Email',
              'x-i18n-title': { fr: 'Email' }
            }
          }
        }
      }
    },
    webhooks: {
      type: 'array',
      title: 'Webhooks',
      'x-i18n-title': { fr: 'Webhooks' },
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
                title: 'The integrity of a dataset is breached',
                'x-i18n-title': { fr: 'L\'intégrité d\'un jeu de données est rompue' }
              }, {
                const: 'dataset-integrity-trail-altered',
                title: 'The revision history of a dataset has been altered',
                'x-i18n-title': { fr: 'L\'historique de révisions d\'un jeu de données est altéré' }
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
              title: 'HTTP call',
              'x-i18n-title': { fr: 'Appel HTTP simple (compatible avec Slack et Mattermost)', en: 'Simple HTTP call (compatible with Slack and Mattermost)' },
              properties: {
                type: {
                  const: 'http',
                  title: 'Target type',
                  'x-i18n-title': { fr: 'Type de cible' }
                },
                params: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: {
                      type: 'string',
                      title: 'Target HTTP server URL',
                      'x-i18n-title': { fr: 'URL du serveur HTTP cible' }
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
            title: 'Identifier',
            'x-i18n-title': { fr: 'Identifiant' },
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
              title: 'External vocabulary identifier',
              description: 'Ideally a URI from a standard vocabulary such as schema.org, i.e. a globally unique identifier of this concept. Can be left empty.'
            }
          },
          title: { type: 'string', title: 'Title', 'x-i18n-title': { fr: 'Titre' }, minLength: 3 },
          description: { type: 'string', title: 'Description', 'x-i18n-title': { fr: 'Description' } },
          tag: { type: 'string', title: 'Category', 'x-i18n-title': { fr: 'Catégorie' } },
          // the default is a fallback read by the code, never written: the placeholder shows it
          type: { type: 'string', title: 'Type', 'x-i18n-title': { fr: 'Type' }, default: 'string', layout: { props: { placeholder: 'String', 'x-i18n-placeholder': { fr: 'Chaîne de caractères' }, persistentPlaceholder: true } }, oneOf: [{ title: 'String', 'x-i18n-title': { fr: 'Chaîne de caractères' }, const: 'string' }, { title: 'Number', 'x-i18n-title': { fr: 'Nombre' }, const: 'number' }] }
        }
      }
    },
    datasetsMetadata: {
      type: 'object',
      title: 'Datasets metadata options',
      layout: {
        title: null
      },
      properties: {
        informationsTitle: {
          type: 'string',
          title: 'First tab title',
          'x-i18n-title': { fr: 'Titre du premier onglet' },
          layout: { cols: 6, getProps: '({ ...layout.props, placeholder: context.labels.groups.informations })', props: { persistentPlaceholder: true } }
        },
        coverageTitle: {
          type: 'string',
          title: 'Second tab title',
          'x-i18n-title': { fr: 'Titre du deuxième onglet' },
          layout: { cols: 6, getProps: '({ ...layout.props, placeholder: context.labels.groups.coverage })', props: { persistentPlaceholder: true } }
        },
        groups: {
          type: 'array',
          title: 'Categories',
          description: 'Tabs added to the metadata form, after the first two.',
          'x-i18n-title': { fr: 'Catégories' },
          'x-i18n-description': { fr: 'Onglets ajoutés au formulaire des métadonnées, après les deux premiers.' },
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
                title: 'Tab title',
                'x-i18n-title': { fr: "Titre de l'onglet" },
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
              title: 'Enable the metadata completeness score',
              'x-i18n-title': { fr: 'Activer le score de complétion des métadonnées' },
              description: 'Computes a score from 0 to 100 on each dataset. Each filled metadata brings its weight, or only half of it if its size is outside the recommended minimum and maximum. A metadata with a weight of 0 does not count.',
              'x-i18n-description': { fr: 'Calcule sur chaque jeu de données un score de 0 à 100. Chaque métadonnée renseignée rapporte son poids, ou la moitié seulement si sa taille sort du minimum et du maximum recommandés. Une métadonnée de poids 0 ne compte pas.' },
              default: false,
              layout: { comp: 'switch' }
            }
          }
        },
        summary: fixedMetadata(metadataTexts('Summary', 'Short presentation of the dataset, shown in lists and on portal thumbnails.', 'Résumé', 'Courte présentation du jeu de données, affichée dans les listes et sur les vignettes des portails.'), informationsGroup, 3, { unit: chars, min: 100, max: 300 }, true),
        // Google Dataset rich results expect a description of 50 to 5000 characters
        description: fixedMetadata(metadataTexts('Description', 'Detailed presentation of the dataset, written in markdown.', 'Description', 'Présentation détaillée du jeu de données, rédigée en markdown.'), informationsGroup, 4, { unit: chars, min: 300, max: 5000 }, true),
        license: fixedMetadata(metadataTexts('License', 'Terms for reusing the data. The list of offered licenses is set in the Licenses tab.', 'Licence', "Conditions de réutilisation des données. La liste des licences proposées se règle dans l'onglet Licences."), informationsGroup, 3),
        origin: fixedMetadata(metadataTexts('Origin', "Address of the page where the original data is published, for example on the producer's website.", 'Provenance', "Adresse de la page où les données d'origine sont publiées, par exemple sur le site du producteur."), informationsGroup, 1),
        image: fixedMetadata(metadataTexts('Thumbnail', 'Address of an image used as the dataset thumbnail, in lists and on portals.', 'Vignette', "Adresse d'une image utilisée comme vignette du jeu de données, dans les listes et sur les portails."), coverageGroup, 1),
        topics: fixedMetadata(metadataTexts('Topics', 'Topics defined in the Topics section of the settings. They classify and filter datasets on portals.', 'Thématiques', 'Thématiques définies dans la section Thématiques des paramètres. Elles servent à classer et à filtrer les jeux de données sur les portails.'), informationsGroup, 2, { unit: values }),
        relatedDatasets: fixedMetadata(metadataTexts('Related datasets', 'Select other similar datasets (same topic, similar structure or any other criterion) to suggest them to portal users.', 'Jeux de données liés', "Sélectionnez d'autres jeux de données proches (même thématique, structure similaire, ou autre critère) pour les proposer aux utilisateurs de portails."), coverageGroup, 0, { unit: values }),
        creator: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.creator,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.creator),
            group: metadataGroup(informationsGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(2)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
        spatial: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.spatial,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.spatial),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(1)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_temporal
        temporal: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.temporal,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.temporal),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(1)
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_frequency and https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
        frequency: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.frequency,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.frequency),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(2)
          }
        },
        modified: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.modified,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.modified),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(0)
          }
        },
        keywords: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.keywords,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.keywords),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(2, { unit: values })
          }
        },
        searchTerms: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.searchTerms,
              type: 'boolean',
              default: true,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.searchTerms),
            group: metadataGroup(coverageGroup, true),
            description: metadataHelp(true),
            ...scoreProperties(0)
          }
        },
        conformsTo: {
          type: 'object',
          properties: {
            active: {
              ...optionalTexts.conformsTo,
              type: 'boolean',
              default: false,
              layout: { comp: 'switch', cols: 4 }
            },
            title: metadataCustomTitle(optionalTexts.conformsTo)
          }
        },
        custom: {
          type: 'array',
          title: 'Custom metadata',
          'x-i18n-title': { fr: 'Métadonnées personnalisées' },
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
            itemSubtitle: `[item.key && context.labels.key + item.key, context.labels.types[item.type ?? "string"] + (item.enum?.length ? context.labels.enum : "") + (item.multiple ? context.labels.multiple : ""), context.labels.category + (${allGroupsExpr}.find(g => g.key === item.group) ?? ${allGroupsExpr}[0]).title, context.customScores?.[item.key]].filter(Boolean).join(" · ")`
          },
          items: {
            type: 'object',
            required: ['title'],
            layout: {
              switch: [{
                if: 'summary',
                children: []
              }, {
                // label, type and category on a line, the score on the next one
                children: ['title', 'type', 'group', 'weight', 'recommendedMin', 'recommendedMax', 'enum', 'multiple', 'description']
              }]
            },
            properties: {
              key: {
                title: 'Key',
                'x-i18n-title': { fr: 'Clé' },
                type: 'string',
                readOnly: true,
                layout: 'none'
              },
              // label, type and category side by side, in line with the other metadata rows
              title: {
                title: 'Label',
                'x-i18n-title': { fr: 'Libellé' },
                type: 'string',
                minLength: 3,
                layout: { cols: 4 }
              },
              type: {
                title: 'Type',
                type: 'string',
                default: 'string',
                // the default is a fallback, never written: the placeholder shows it
                layout: { cols: 4, props: { placeholder: 'Text', 'x-i18n-placeholder': { fr: 'Texte' }, persistentPlaceholder: true } },
                oneOf: [
                  { const: 'string', title: 'Text', 'x-i18n-title': { fr: 'Texte' } },
                  { const: 'integer', title: 'Integer', 'x-i18n-title': { fr: 'Nombre entier' } },
                  { const: 'number', title: 'Number', 'x-i18n-title': { fr: 'Nombre' } },
                  { const: 'date', title: 'Date', 'x-i18n-title': { fr: 'Date' } },
                  { const: 'link', title: 'Link (URL and label)', 'x-i18n-title': { fr: 'Lien (URL et libellé)' } }
                ]
              },
              group: metadataGroup(informationsGroup, false, 4),
              weight: scoreField(weightTitles, 1, scoreActive, {}, undefined, 4),
              // the options of a text, then the size recommended for its values
              enum: {
                title: 'List of values',
                description: 'Leave empty for free input.',
                'x-i18n-title': { fr: 'Liste de valeurs' },
                'x-i18n-description': { fr: 'Laissez vide pour une saisie libre.' },
                type: 'array',
                items: { type: 'string' },
                layout: { cols: 8, if: textType }
              },
              multiple: {
                title: 'Multiple values',
                'x-i18n-title': { fr: 'Plusieurs valeurs' },
                type: 'boolean',
                layout: { cols: 4, comp: 'checkbox', if: textType }
              },
              ...Object.fromEntries(['recommendedMin', 'recommendedMax'].map((key, i) => [key, scoreField(
                { title: ['Min.', 'Max.'][i] },
                undefined,
                customBounds,
                {},
                `({ ...layout.props, suffix: context.labels.units[parent.data?.multiple ? ${JSON.stringify(values)} : ${JSON.stringify(chars)}] })`,
                4
              )])),
              description: {
                title: 'Tooltip',
                description: 'Help text shown next to the field, in the dataset form.',
                'x-i18n-title': { fr: 'Infobulle' },
                'x-i18n-description': { fr: "Texte d'aide affiché à côté du champ, dans le formulaire du jeu de données." },
                type: 'string',
                layout: { comp: 'textarea', props: helpProps }
              }
            }
          }
        }
      }
    },
    compatODS: {
      type: 'boolean',
      title: 'ODS compatibility',
      description: 'Enables the compatibility with the ODS API',
      default: false
    },
    agentChat: {
      type: 'boolean',
      title: 'AI assistant',
      description: 'Enables the AI assistant',
      default: false
    },
    agentChatAudience: {
      type: 'array',
      title: 'AI assistant audience',
      description: 'Restricts the AI assistant to the members matching one of these rules. Empty: all members.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['department'],
        properties: {
          department: {
            type: 'string',
            description: 'Department identifier, "*" for all departments or "-" for the main organization only'
          },
          roles: {
            type: 'array',
            description: 'Concerned roles, all if empty',
            items: { type: 'string' }
          }
        }
      }
    }
  }
}
