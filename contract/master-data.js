exports.schema = {
  type: 'object',
  title: 'Données de référence',
  properties: {
    singleSearchs: {
      type: 'array',
      title: 'Recherches unitaires',
      'x-slots': {
        before: 'Les recherches unitaires sont utilisables pour récupérer plusieurs lignes du jeu de données de référence à partir d\'une recherche sur 1 critère. Elles servent notamment à construire des champs de recherche dans les formulaires d\'édition de ligne des jeux incrémentaux.'
      },
      'x-class': 'mb-4',
      'x-options': { editMode: 'dialog' },
      items: {
        type: 'object',
        required: ['id', 'title', 'output'],
        properties: {
          id: { type: 'string', title: 'Identifiant' },
          title: { type: 'string', title: 'Titre' },
          description: { type: 'string', title: 'Description', 'x-display': 'textarea' },
          output: {
            type: 'object',
            title: 'Propriété à retourner',
            'x-fromData': 'context.propertiesWithConcepts',
            'x-itemTitle': 'title',
            'x-itemKey': 'key'
          },
          label: {
            type: 'object',
            title: 'Propriété utilisée pour représenter les résultats',
            'x-fromData': 'context.stringProperties',
            'x-itemTitle': 'title',
            'x-itemKey': 'key'
          }
          /* input: {
            type: 'array',
            title: 'Propriétés utilisées pour la recherche',
            minItems: 1,
            'x-options': { editMode: 'inline' },
            items: {
              type: 'object',
              required: ['property'],
              properties: {
                property: {
                  type: 'object',
                  title: 'Propriété',
                  'x-fromData': 'context.searchProperties',
                  'x-itemTitle': 'title',
                  'x-itemKey': 'key',
                },
              },
            },
          }, */
        }
      }
    },
    bulkSearchs: {
      type: 'array',
      title: 'Recherches en masse',
      'x-slots': {
        before: 'Les recherches en masse sont utilisables pour enrichir des données de multiples lignes avec 1 résultat par ligne.'
      },
      'x-class': 'mt-4',
      'x-options': { editMode: 'dialog' },
      items: {
        type: 'object',
        required: ['id', 'title'],
        properties: {
          id: { type: 'string', title: 'Identifiant' },
          title: { type: 'string', title: 'Titre' },
          description: { type: 'string', title: 'Description', 'x-display': 'textarea' },
          input: {
            type: 'array',
            title: 'Filtres',
            minItems: 1,
            'x-options': { editMode: 'inline' },
            items: {
              type: 'object',
              required: ['type', 'property'],
              oneOf: [{
                title: 'Valeur exacte',
                properties: {
                  type: { type: 'string', const: 'equals', title: 'Type de filtre' },
                  property: {
                    type: 'object',
                    title: 'Propriété comparée',
                    'x-fromData': 'context.propertiesWithConcepts',
                    'x-itemTitle': 'title',
                    'x-itemKey': 'key'
                  }
                }
              }, {
                title: 'Date dans l\'interval',
                'x-if': 'context.hasDateIntervalConcepts',
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
                }
              }, {
                title: 'Coordonnée géographique à une distance',
                'x-if': 'context.dataset.bbox',
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
                }
              }]
            }
          },
          sort: {
            type: 'string',
            title: 'Tri pour choisir le meilleur résultat',
            description: `
Le tri à effectuer sous forme d'une liste de clés de colonnes séparées par des virgules.

Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple: ma_colonne,-ma_colonne2`
          }
        }
      }
    }
  }
}

exports.endpoints = (dataset) => {
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
      delete a[f.key].ignoreDetection
      delete a[f.key].separator
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
        tags: ['Recherche unitaire de données de référence'],
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
      const matchingProp = dataset.schema.find(p => p.key === input.property.key)
      inputProperties[input.property.key] = matchingProp ? { ...matchingProp } : { ...input.property }
      inputProperties[input.property.key].title = inputProperties[input.property.key].title || ''
      inputProperties[input.property.key].description = inputProperties[input.property.key].description || ''
      delete inputProperties[input.property.key].key
      delete inputProperties[input.property.key].ignoreDetection
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
        tags: ['Recherche en masse de données de référence'],
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
            default: [],
            type: 'array',
            items: {
              type: 'string',
              enum: properties
            }
          },
          style: 'commaDelimited'
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
