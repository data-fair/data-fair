const filters = {
  type: 'array',
  title: 'Static filters',
  'x-i18n-title': { fr: 'Filtres statiques' },
  items: {
    type: 'object',
    required: ['property', 'values'],
    properties: {
      property: {
        type: 'object',
        title: 'Property to filter on',
        'x-i18n-title': { fr: 'Propriété sur laquelle appliquer le filtre' },
        layout: {
          getItems: {
            type: 'js-eval',
            expr: 'context.filterProperties',
            pure: true,
            itemKey: 'data["key"]',
            itemTitle: 'data["title"]'
          }
        }
      },
      values: {
        type: 'array',
        title: 'Values',
        'x-i18n-title': { fr: 'Valeurs' },
        items: {
          type: 'string'
        }
      }
    }
  }
}

export const schema = {
  type: 'object',
  title: 'Master data',
  layout: { title: null },
  properties: {
    shareOrgs: {
      type: 'array',
      title: 'Share this master data with your partners',
      'x-i18n-title': { fr: 'Partagez cette donnée de référence avec vos partenaires' },
      description: 'Sharing with partners only affects the visibility of the actions related to this master data. It has no effect on the permissions, which you must define separately.',
      'x-i18n-description': { fr: 'Le partage à des partenaires affecte simplement la visibilité des actions liées à ces données de référence. Il est sans effet sur les permissions que vous devez définir séparément.' },
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      },
      layout: {
        if: { type: 'js-eval', expr: 'context.ownerOrg', pure: true },
        props: {
          noDataText: 'You have no partners configured for your organization yet.',
          'x-i18n-noDataText': { fr: 'Vous n\'avez pas encore de partenaires configurés pour votre organisation.' }
        },
        getItems: {
          // eslint-disable-next-line no-template-curly-in-string
          url: { type: 'js-tpl', expr: '${context.directoryUrl}/api/${context.dataset.owner.type}s/${context.dataset.owner.id}', pure: true },
          itemKey: 'data["id"]',
          itemTitle: 'data["name"]',
          itemsResults: 'data["partners"]'
        }
      }
    },
    bulkSearchs: {
      type: 'array',
      title: 'Bulk lines retrieval',
      'x-i18n-title': { fr: 'Récupération de lignes en masse' },
      description: 'Let your users retrieve a large number of lines from a simple matching rule. This feature creates a new enrichment source.',
      'x-i18n-description': { fr: 'Permettez à vos utilisateurs de récupérer un grand nombre de lignes à partir d\'une règle de correspondance simple. Cette fonctionnalité permet de créer une nouvelle source d\'enrichissement.' },
      items: {
        type: 'object',
        required: ['title', 'input'],
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
          title: {
            type: 'string',
            title: 'Title',
            'x-i18n-title': { fr: 'Titre' },
            minLength: 3,
            layout: {
              props: { placeholder: 'Example "Retrieve the information of several products"', 'x-i18n-placeholder': { fr: 'Exemple "Récupérer les informations de plusieurs produits"' } }
            }
          },
          description: {
            type: 'string',
            title: 'Description',
            layout: {
              comp: 'textarea',
              props: { placeholder: 'Example "This enrichment lets you retrieve the information of several products from a list of product codes."', 'x-i18n-placeholder': { fr: 'Exemple "Cet enrichissement vous permet de récupérer les informations de plusieurs produits à partir d\'une liste de codes produits."' } }
            }
          },
          filters,
          input: {
            type: 'array',
            title: 'Matching methods',
            'x-i18n-title': { fr: 'Méthodes de correspondance' },
            minItems: 1,
            items: {
              type: 'object',
              required: ['type', 'property'],
              oneOf: [{
                title: 'Exactly equal values',
                'x-i18n-title': { fr: 'Valeurs exactement égales' },
                required: ['type', 'property'],
                properties: {
                  type: { type: 'string', const: 'equals', title: 'Matching method type', 'x-i18n-title': { fr: 'Type de méthode de correspondance' } },
                  property: {
                    type: 'object',
                    title: 'Compared property',
                    'x-i18n-title': { fr: 'Propriété comparée' },
                    required: ['key'],
                    properties: {
                      key: { type: 'string' },
                      title: { type: 'string' },
                      'x-refersTo': { type: 'string' }
                    },
                    layout: {
                      props: {
                        noDataText: 'No column of this dataset has an associated concept. Define concepts in the Schema tab.',
                        'x-i18n-noDataText': { fr: 'Aucune colonne de ce jeu de données n\'a de concept associé. Définissez des concepts dans l\'onglet Schéma.' }
                      },
                      getItems: {
                        type: 'js-eval',
                        expr: 'context.propertiesWithConcepts',
                        pure: true,
                        itemKey: 'data["key"]',
                        itemTitle: 'data["title"]'
                      }
                    }
                  }
                }
              }, {
                title: 'Date in interval',
                'x-i18n-title': { fr: 'Date dans un intervalle' },
                required: ['type', 'property'],
                properties: {
                  type: { type: 'string', const: 'date-in-interval' },
                  property: {
                    type: 'object',
                    title: 'Date to fill in',
                    'x-i18n-title': { fr: 'Date à renseigner' },
                    required: ['key'],
                    properties: {
                      'x-refersTo': { type: 'string', const: 'http://schema.org/Date' },
                      key: { type: 'string', const: '_date' },
                      type: { type: 'string', const: 'string' },
                      format: { type: 'string', const: 'date-time' }
                    }
                  }
                },
                layout: {
                  if: { type: 'js-eval', expr: 'context.hasDateIntervalConcepts', pure: true }
                }
              }, {
                title: 'Nearby geographic coordinate',
                'x-i18n-title': { fr: 'Coordonnée géographique à proximité' },
                required: ['type', 'distance', 'property'],
                properties: {
                  type: { type: 'string', const: 'geo-distance' },
                  distance: {
                    type: 'integer',
                    title: 'Distance',
                    default: 0
                  },
                  property: {
                    type: 'object',
                    title: 'Point to fill in',
                    'x-i18n-title': { fr: 'Point à renseigner' },
                    required: ['key'],
                    properties: {
                      'x-refersTo': { type: 'string', const: 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long' },
                      key: { type: 'string', const: '_geopoint' },
                      type: { type: 'string', const: 'string' }
                    }
                  }
                },
                layout: {
                  if: { type: 'js-eval', expr: 'context.dataset.bbox', pure: true }
                }
              }],
              oneOfLayout: { label: 'Matching method type', 'x-i18n-label': { fr: 'Type de méthode de correspondance' } }
            }
          },
          sort: {
            type: 'string',
            title: 'Sort to choose among ambiguous results',
            'x-i18n-title': { fr: 'Tri pour choisir parmi des résultats ambigus' },
            description: `
Note: this parameter is optional and only useful if the matching method can return several results per line.

The sort is expressed as a list of column keys separated by commas. The sort is ascending by default, if a column name is prefixed with a "-" then the sort is descending.

Example: my_column,-my_column2`,
            'x-i18n-description': {
              fr: `
Remarque : ce paramètre est optionnel et utile uniquement si la manière d'établir une correspondance est susceptible de retourner plusieurs résultats par ligne.

Le tri est exprimé sous forme d'une liste de clés de colonnes séparées par des virgules. Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple : ma_colonne,-ma_colonne2`
            }
          }
        }
      },
      layout: {
        itemTitle: 'data.title'
      }
    },
    singleSearchs: {
      type: 'array',
      title: 'Code / label pairs search',
      'x-i18n-title': { fr: 'Recherche de paires code / libellé' },
      description: 'Let your users retrieve a list of results from a text search on a column of labels. This feature creates search fields in the line edition forms of editable datasets.',
      'x-i18n-description': { fr: 'Permettez à vos utilisateurs de récupérer une liste de résultats à partir d\'une recherche textuelle sur une colonne de libellés. Cette fonctionnalité permet de créer des champs de recherche dans les formulaires d\'édition de ligne des jeux éditables.' },
      items: {
        type: 'object',
        required: ['title', 'output'],
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
          title: {
            type: 'string',
            title: 'Title',
            'x-i18n-title': { fr: 'Titre' },
            minLength: 3,
            layout: {
              props: { placeholder: 'Example "Search for a product"', 'x-i18n-placeholder': { fr: 'Exemple "Recherche d\'un produit"' } }
            }
          },
          description: {
            type: 'string',
            title: 'Description',
            layout: {
              comp: 'textarea',
              props: { placeholder: 'Example "Retrieve a product code by searching in its code or its label"', 'x-i18n-placeholder': { fr: 'Exemple "Récupérez un code produit en effectuant une recherche dans son code ou son libellé"' } }
            }
          },
          output: {
            type: 'object',
            title: 'Property to return (code)',
            'x-i18n-title': { fr: 'Propriété à retourner (code)' },
            layout: {
              props: {
                noDataText: 'No column of this dataset has an associated concept. Define concepts in the Schema tab.',
                'x-i18n-noDataText': { fr: 'Aucune colonne de ce jeu de données n\'a de concept associé. Définissez des concepts dans l\'onglet Schéma.' }
              },
              getItems: {
                type: 'js-eval',
                expr: 'context.propertiesWithConcepts',
                pure: true,
                itemKey: 'data["key"]',
                itemTitle: 'data["title"]'
              }
            }
          },
          label: {
            type: 'object',
            title: 'Property displayed while typing (label)',
            'x-i18n-title': { fr: 'Propriété affichée lors de la saisie (libellé)' },
            description: 'Property displayed next to the code in the list of suggestions, as “code (label)”, to help the user identify the right value. The search runs on all the text columns of the dataset.',
            'x-i18n-description': { fr: 'Propriété affichée à côté du code dans la liste des suggestions, sous la forme « code (libellé) », pour aider l\'utilisateur à identifier la bonne valeur. La recherche s\'effectue sur toutes les colonnes textuelles du jeu de données.' },
            layout: {
              props: {
                noDataText: 'No text column in this dataset.',
                'x-i18n-noDataText': { fr: 'Aucune colonne textuelle dans ce jeu de données.' }
              },
              getItems: {
                type: 'js-eval',
                expr: 'context.stringProperties',
                pure: true,
                itemKey: 'data["key"]',
                itemTitle: 'data["title"]'
              }
            }
          },
          filters
        }
      },
      layout: {
        itemTitle: 'data.title'
      }
    },
    virtualDatasets: {
      type: 'object',
      description: 'Offer your users to create virtual datasets from this dataset. It is a useful option to make it easier to create filtered views of this data.',
      'x-i18n-description': { fr: 'Proposez à vos utilisateurs de créer des jeux virtuels à partir de ce jeu de données. C\'est une option intéressante pour faciliter la création de vues filtrées de cette donnée.' },
      properties: {
        active: {
          type: 'boolean',
          title: 'Virtual datasets creation',
          'x-i18n-title': { fr: 'Création de jeux virtuels' }
        }
      }
    },
    standardSchema: {
      type: 'object',
      description: 'Offer your users to initialize editable datasets from the metadata and the data of this dataset.',
      'x-i18n-description': { fr: 'Proposez à vos utilisateurs d\'initialiser des jeux éditables à partir des métadonnées et des données de ce jeu de données.' },
      properties: {
        active: {
          type: 'boolean',
          title: 'Editable datasets initialization',
          'x-i18n-title': { fr: 'Initialisation de jeux éditables' }
        }
      }
    }
  }
}

export const endpoints = (dataset) => {
  const endpoints = {}
  if (!dataset.masterData) return endpoints
  if (!dataset.masterData.bulkSearchs?.length && !dataset.masterData.singleSearchs?.length) return endpoints
  const outputProperties = dataset.schema.filter(f => !f['x-calculated'])
  const datasetLineSchema = {
    type: 'object',
    properties: outputProperties.reduce((a, f) => {
      a[f.key] = {
        ...f,
        title: f.title || f['x-originalName'] || f.key,
        description: f.description || ''
      }
      delete a[f.key].key
      if ('separator' in a[f.key]) {
        a[f.key]['x-separator'] = a[f.key].separator
        delete a[f.key].separator
      }
      delete a[f.key].icon
      delete a[f.key].label
      return a
    }, {})
  }
  datasetLineSchema.properties._key = {
    title: 'Identifiant de la ligne de requête',
    type: 'string',
    'x-refersTo': 'http://schema.org/identifier'
  }
  datasetLineSchema.properties._error = {
    type: 'string',
    title: 'Erreur de récupération de données de référence'
  }

  const properties = outputProperties.map(p => p.key)

  for (const singleSearch of dataset.masterData.singleSearchs || []) {
    const properties = {
      output: {
        type: 'string',
        title: 'Property to return',
        'x-refersTo': singleSearch.output['x-refersTo']
      },
      _score: {
        type: 'number',
        title: 'Result relevance'
      }
    }
    if (singleSearch.label && singleSearch.label.key) {
      properties.label = {
        type: 'string',
        title: 'Property used to represent the results',
        'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label'
      }
    }
    endpoints[`/master-data/single-searchs/${singleSearch.id}`] = {
      get: {
        tags: ['Données de référence'],
        summary: singleSearch.title,
        description: singleSearch.description || '',
        operationId: `masterData_singleSearch_${singleSearch.id}`,
        'x-operationType': 'http://schema.org/SearchAction',
        'x-permissionClass': 'read',
        parameters: [{
          in: 'query',
          name: 'q',
          description: 'The text search to perform',
          schema: {
            type: 'string'
          }
        }, {
          in: 'query',
          name: 'size',
          description: 'Number of candidate results to return',
          schema: {
            type: 'integer',
            default: 20
          }
        }],
        responses: {
          200: {
            description: 'Response when the request succeeds',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties
                }
              }
            }
          }
        }
      }
    }
  }

  for (const bulkSearch of dataset.masterData.bulkSearchs || []) {
    const inputProperties = {}
    for (const input of bulkSearch.input) {
      // equals inputs saved as a bare { key } (UI regression, see #576) take the concept from the schema
      const matchingProp = dataset.schema.find(p => p.key === input.property.key && p['x-refersTo'] === (input.property['x-refersTo'] ?? p['x-refersTo']))
      inputProperties[input.property.key] = matchingProp ? { ...matchingProp } : { ...input.property }
      inputProperties[input.property.key].title = inputProperties[input.property.key].title || ''
      inputProperties[input.property.key].description = inputProperties[input.property.key].description || ''
      delete inputProperties[input.property.key].key
      delete inputProperties[input.property.key].separator
      delete inputProperties[input.property.key].icon
      delete inputProperties[input.property.key].label
    }
    inputProperties._key = {
      description: 'Identifiant de la ligne de requête',
      type: 'string',
      'x-refersTo': 'http://schema.org/identifier'
    }

    endpoints[`/master-data/bulk-searchs/${bulkSearch.id}`] = {
      post: {
        tags: ['Données de référence'],
        summary: bulkSearch.title,
        description: bulkSearch.description || '',
        operationId: `masterData_bulkSearch_${bulkSearch.id}`,
        'x-operationType': 'http://schema.org/SearchAction',
        'x-permissionClass': 'read',
        parameters: [{
          in: 'query',
          name: 'select',
          description: 'The list of columns to return',
          schema: {
            type: 'array',
            items: {
              type: 'string',
              enum: properties
            }
          },
          style: 'form',
          explode: false
        }],
        requestBody: {
          description: 'Set of filters to apply',
          required: true,
          content: {
            'application/x-ndjson': {
              schema: {
                title: 'Filter for one line',
                type: 'object',
                properties: inputProperties
              }
            },
            'application/json': {
              schema: {
                title: 'Filter for one line',
                type: 'object',
                properties: inputProperties
              }
            },
            'text/csv': {
              schema: {
                title: 'Filter for one line',
                type: 'object',
                properties: inputProperties
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Response when the request succeeds',
            content: {
              'application/x-ndjson': {
                schema: datasetLineSchema
              },
              'application/json': {
                schema: datasetLineSchema
              },
              'text/csv': {
                schema: datasetLineSchema
              }
            }
          },
          400: {
            description: 'Badly formatted request',
            content: {
              'application/json': {
                schema: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    }
  }
  return endpoints
}

/**
 * A dataset is reference data as soon as one of the master-data features is configured on it.
 * The sub-object is often present but empty on datasets that are not reference data at all.
 * @param {any} masterData
 */
export const isMasterData = (masterData) => !!masterData && !!(
  masterData.shareOrgs?.length ||
  masterData.singleSearchs?.length ||
  masterData.bulkSearchs?.length ||
  masterData.virtualDatasets?.active ||
  masterData.standardSchema?.active
)
