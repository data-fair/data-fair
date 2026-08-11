import _publicationSites from '../../contract/publication-sites.js'
const publicationSites = _publicationSites()

/**
 * The completeness criteria that only count when the owner offers their field in the Metadata
 * options. Exported because three readers need the exact same list and drifting between them is
 * silent: the scoring module's applicability gate, the weight layouts below that hide an input no
 * configuration could make count, and the settings form that warns when the denominator is empty.
 */
export const completenessGatedByMetadata = ['keywords', 'creator', 'frequency', 'spatial', 'temporal', 'conformsTo']

/**
 * The completeness weights are one-digit integers with short labels: several fit on a row, up to 4
 * on a wide settings section. `context.offeredCriteria` is filled by the settings form and hides
 * the criteria whose field is not offered in the Metadata tab — they cannot count, so a weight for
 * them is only confusing. Hidden and not deleted: json-layout leaves the data of a hidden node
 * alone, so a weight configured once comes back untouched if the field is offered again.
 */
const weightCols = { xs: 6, sm: 4, md: 3 }
// topics is gated too, on the organization having defined any rather than on a metadata option
const gatedWeights = new Set([...completenessGatedByMetadata, 'topics'])
/** @type {(criterion: string) => object} */
const weightLayout = (criterion) => gatedWeights.has(criterion)
  ? { cols: weightCols, if: `context.offeredCriteria?.${criterion}` }
  : { cols: weightCols }

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
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_spatial
        spatial: {
          type: 'object',
          properties: {
            active: {
              title: 'Couverture spatiale',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Couverture spatiale' }
              }
            }
          }
        },
        // https://www.w3.org/TR/vocab-dcat-2/#Property:dataset_temporal
        temporal: {
          type: 'object',
          properties: {
            active: {
              title: 'Couverture temporelle',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
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
              title: 'Fréquence de mise à jour',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Fréquence de mise à jour' }
              }
            }
          }
        },
        creator: {
          type: 'object',
          properties: {
            active: {
              title: 'Personne ou organisme créateur',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
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
              title: 'Date de modification de la source',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Date de modification de la source' }
              }
            }
          }
        },
        keywords: {
          type: 'object',
          properties: {
            active: {
              title: 'Mots clés',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Mots clés' }
              }
            }
          }
        },
        conformsTo: {
          type: 'object',
          properties: {
            active: {
              title: 'Schéma',
              type: 'boolean',
              default: false,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Schéma' }
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
                fr: 'Ajouter une métadonnée'
              }
            },
            itemTitle: '(item.title ?? "") + (item.key ? (" (" + item.key + ")") : "")'
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
                minLength: 3
              }
            }
          }
        }
      }
    },
    metadataCompleteness: {
      type: 'object',
      title: 'Qualité des métadonnées',
      layout: { title: null },
      properties: {
        active: {
          type: 'boolean',
          default: false,
          layout: 'switch',
          title: 'Calculer un score de complétude des métadonnées'
        },
        // property order is load-bearing: the scoring module derives its criteria list from it, and
        // uses it to break ties between criteria of equal weight in the `missing` list it returns
        weights: {
          type: 'object',
          title: 'Poids des critères',
          description: 'Un poids à 0 retire le critère du calcul.',
          layout: { if: 'parent.data.active' },
          properties: {
            description: { type: 'integer', minimum: 0, default: 4, title: 'Description', layout: weightLayout('description') },
            summary: { type: 'integer', minimum: 0, default: 3, title: 'Résumé', layout: weightLayout('summary') },
            license: { type: 'integer', minimum: 0, default: 3, title: 'Licence', layout: weightLayout('license') },
            keywords: { type: 'integer', minimum: 0, default: 2, title: 'Mots clés', layout: weightLayout('keywords') },
            topics: { type: 'integer', minimum: 0, default: 2, title: 'Thématiques', layout: weightLayout('topics') },
            creator: { type: 'integer', minimum: 0, default: 2, title: 'Créateur', layout: weightLayout('creator') },
            origin: { type: 'integer', minimum: 0, default: 1, title: 'Provenance', layout: weightLayout('origin') },
            frequency: { type: 'integer', minimum: 0, default: 1, title: 'Fréquence de mise à jour', layout: weightLayout('frequency') },
            spatial: { type: 'integer', minimum: 0, default: 1, title: 'Couverture spatiale', layout: weightLayout('spatial') },
            temporal: { type: 'integer', minimum: 0, default: 1, title: 'Couverture temporelle', layout: weightLayout('temporal') },
            conformsTo: { type: 'integer', minimum: 0, default: 1, title: 'Schéma', layout: weightLayout('conformsTo') }
          }
        },
        description: {
          type: 'object',
          title: 'Longueur attendue de la description',
          description: 'Une borne à 0 ne limite pas de ce côté. Un texte absent ou vide ne compte jamais.',
          layout: { if: 'parent.data.active' },
          properties: {
            min: { type: 'integer', minimum: 0, default: 200, title: 'Minimum', layout: { cols: 6 } },
            max: { type: 'integer', minimum: 0, title: 'Maximum', layout: { cols: 6 } }
          }
        },
        summary: {
          type: 'object',
          title: 'Longueur attendue du résumé',
          description: 'Une borne à 0 ne limite pas de ce côté. Un texte absent ou vide ne compte jamais.',
          layout: { if: 'parent.data.active' },
          properties: {
            min: { type: 'integer', minimum: 0, default: 50, title: 'Minimum', layout: { cols: 6 } },
            max: { type: 'integer', minimum: 0, default: 250, title: 'Maximum', layout: { cols: 6 } }
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
