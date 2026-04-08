const filters = {
  type: 'array',
  title: 'Filtres statiques',
  items: {
    type: 'object',
    required: ['property', 'values'],
    properties: {
      property: {
        type: 'object',
        title: 'Propriété sur laquelle appliquer le filtre',
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
        title: 'Valeurs',
        items: {
          type: 'string'
        }
      }
    }
  }
}

export const schema = {
  type: 'object',
  title: 'Données de référence',
  layout: { title: null },
  properties: {
    shareOrgs: {
      type: 'array',
      title: 'Partagez cette donnée de référence avec vos partenaires',
      description: 'Le partage à des partenaires affecte simplement la visibilité des actions liées à ces données de référence. Il est sans effet sur les permissions que vous devez définir séparément.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      },
      layout: {
        if: { type: 'js-eval', expr: 'context.ownerOrg', pure: true },
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
      title: 'Récupération de lignes en masse',
      description: 'Permettez à vos utilisateurs de récupérer un grand nombre de lignes à partir d\'une règle de correspondance simple. Cette fonctionnalité permet de créer une nouvelle source d\'enrichissement.',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          id: {
            type: 'string',
            title: 'Identifiant',
            readOnly: true,
            layout: {
              if: { type: 'js-eval', expr: 'parent.data.id', pure: false }
            }
          },
          title: {
            type: 'string',
            title: 'Titre',
            minLength: 3,
            layout: {
              props: { placeholder: 'exemple "récupérer les informations de plusieurs produits"' }
            }
          },
          description: {
            type: 'string',
            title: 'Description',
            layout: {
              comp: 'textarea',
              props: { placeholder: 'exemple "cet enrichissement vous permet de récupérer les informations de plusieurs produits à partir d\'une liste de codes produits."' }
            }
          },
          filters,
          input: {
            type: 'array',
            title: 'Méthodes de correspondance',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type', 'property'],
              oneOf: [{
                title: 'Valeurs exactement égales',
                required: ['type', 'property'],
                properties: {
                  type: { type: 'string', const: 'equals', title: 'Type de méthode de correspondance' },
                  property: {
                    type: 'object',
                    title: 'Propriété comparée',
                    layout: {
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
                title: 'Date dans un interval',
                properties: {
                  type: { type: 'string', const: 'date-in-interval' },
                  property: {
                    type: 'object',
                    title: 'Date à renseigner',
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
                title: 'Coordonnée géographique à proximité',
                required: ['type', 'distance'],
                properties: {
                  type: { type: 'string', const: 'geo-distance' },
                  distance: {
                    type: 'integer',
                    title: 'Distance',
                    default: 0
                  },
                  property: {
                    type: 'object',
                    title: 'Point à renseigner',
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
              oneOfLayout: { label: 'Type de méthode de correspondance' }
            }
          },
          sort: {
            type: 'string',
            title: 'Tri pour choisir parmi des résultats ambigus',
            description: `
Remarque : ce paramètre est optionnel et utile uniquement si la manière d'établir une correspondance est susceptible de retourner plusieurs résultats par ligne.

Le tri est exprimé sous forme d'une liste de clés de colonnes séparées par des virgules. Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple: ma_colonne,-ma_colonne2`
          }
        }
      },
      layout: {
        itemTitle: 'data.title'
      }
    },
    singleSearchs: {
      type: 'array',
      title: 'Recherche de paires code / libellé',
      description: 'Permettez à vos utilisateurs de récupérer une liste de résultats à partir d\'une recherche textuelle sur une colonne de libellés. Cette fonctionnalité permet de créer des champs de recherche dans les formulaires d\'édition de ligne des jeux éditables.',
      items: {
        type: 'object',
        required: ['title', 'output'],
        properties: {
          id: {
            type: 'string',
            title: 'Identifiant',
            readOnly: true,
            layout: {
              if: { type: 'js-eval', expr: 'parent.data.id', pure: false }
            }
          },
          title: {
            type: 'string',
            title: 'Titre',
            minLength: 3,
            layout: {
              props: { placeholder: 'exemple "recherche d\'un produit"' }
            }
          },
          description: {
            type: 'string',
            title: 'Description',
            layout: {
              comp: 'textarea',
              props: { placeholder: 'exemple "récupérez un code produit en effectuant une recherche dans son code ou son libellé"' }
            }
          },
          output: {
            type: 'object',
            title: 'Propriété à retourner (code)',
            layout: {
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
            title: 'Propriété utilisée pour la recherche (libellé)',
            layout: {
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
      description: 'Proposez à vos utilisateurs de créer des jeux virtuels à partir de ce jeu de données. C\'est une option intéressante pour faciliter la création de vues filtrées de cette donnée.',
      properties: {
        active: {
          type: 'boolean',
          title: 'Création de jeux virtuels'
        }
      }
    },
    standardSchema: {
      type: 'object',
      description: 'Proposez à vos utilisateurs d\'initialiser des jeux éditables à partir des métadonnées et des données de ce jeu de données.',
      properties: {
        active: {
          type: 'boolean',
          title: 'Initialisation de jeux éditables'
        }
      }
    }
  }
}

export const endpoints = (dataset) => {
  const endpoints = {}
  if (!dataset.masterData || !dataset.masterData.bulkSearchs) return endpoints
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
        title: 'Propriété à retourner',
        'x-refersTo': singleSearch.output['x-refersTo']
      },
      _score: {
        type: 'number',
        title: 'Pertinence du résultat'
      }
    }
    if (singleSearch.label && singleSearch.label.key) {
      properties.label = {
        type: 'string',
        title: 'Propriété utilisée pour représenter les résultats',
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
          description: 'La recherche textuelle à effectuer',
          schema: {
            type: 'string'
          }
        }, {
          in: 'query',
          name: 'size',
          description: 'Nombre de résultats candidats à retourner',
          schema: {
            type: 'integer',
            default: 20
          }
        }],
        responses: {
          200: {
            description: 'Réponse en cas de succès de la requête',
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
      const matchingProp = dataset.schema.find(p => p.key === input.property.key && p['x-refersTo'] === input.property['x-refersTo'])
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
          description: 'La liste des colonnes à retourner',
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
          description: 'Ensemble de filtres à appliquer',
          required: true,
          content: {
            'application/x-ndjson': {
              schema: {
                title: 'Filtre pour une ligne',
                type: 'object',
                properties: inputProperties
              }
            },
            'application/json': {
              schema: {
                title: 'Filtre pour une ligne',
                type: 'object',
                properties: inputProperties
              }
            },
            'text/csv': {
              schema: {
                title: 'Filtre pour une ligne',
                type: 'object',
                properties: inputProperties
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Réponse en cas de succès de la requête',
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
            description: 'Mauvais formattage de la requête',
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
