exports.schema = {
  type: 'object',
  title: 'Données de référence',
  properties: {
    bulkSearchs: {
      type: 'array',
      title: 'Recherches en masse',
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
                    'x-itemKey': 'key',
                  },
                },
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
                      format: { type: 'string', const: 'date-time' },
                    },
                  },
                },
              }, {
                title: 'Coordonnée géographique à une distance',
                'x-if': 'context.dataset.bbox',
                properties: {
                  type: { type: 'string', const: 'geo-distance' },
                  distance: {
                    type: 'integer',
                    title: 'Distance',
                    default: 0,
                  },
                  property: {
                    type: 'object',
                    title: 'Point à renseigner',
                    properties: {
                      'x-refersTo': { type: 'string', const: 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long' },
                      key: { type: 'string', const: '_geopoint' },
                      type: { type: 'string', const: 'string' },
                    },
                  },
                },
              }],
            },
          },
          sort: {
            type: 'string',
            title: 'Tri pour choisir le meilleur résultat',
            description: `
Le tri à effectuer sous forme d'une liste de clés de colonnes séparées par des virgules.

Par défaut le tri est ascendant, si un nom de colonne est préfixé par un "-" alors le tri sera descendant.

Exemple: ma_colonne,-ma_colonne2`,
          },
        },
      },
    },
  },
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
        description: f.description || '',
      }
      delete a[f.key].key
      return a
    }, {}),
  }
  datasetLineSchema.properties._key = {
    title: 'Identifiant de la ligne de requête',
    type: 'string',
    'x-refersTo': 'http://schema.org/identifier',
  }
  datasetLineSchema.properties._error = {
    type: 'string',
    title: 'Erreur de récupération de données de référence',
  }

  const properties = outputProperties.map(p => p.key)

  for (const bulkSearch of dataset.masterData.bulkSearchs) {
    const inputProperties = {}
    for (const input of bulkSearch.input) {
      const matchingProp = dataset.schema.find(p => p.key === input.property.key)
      inputProperties[input.property.key] = matchingProp ? { ...matchingProp } : { ...input.property }
      inputProperties[input.property.key].title = inputProperties[input.property.key].title || ''
      inputProperties[input.property.key].description = inputProperties[input.property.key].description || ''
      delete inputProperties[input.property.key].key
    }
    inputProperties._key = {
      description: 'Identifiant de la ligne de requête',
      type: 'string',
      'x-refersTo': 'http://schema.org/identifier',
    }

    endpoints[`/master-data/bulk-searchs/${bulkSearch.id}`] = {
      post: {
        tags: [
          'Recherche en masse de données de référence',
        ],
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
              enum: properties,
            },
          },
          style: 'commaDelimited',
        }],
        requestBody: {
          description: 'Ensemble de filtres à appliquer',
          required: true,
          content: {
            'application/x-ndjson': {
              schema: {
                title: 'Filtre pour une ligne',
                type: 'object',
                properties: inputProperties,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Réponse en cas de succès de la requête',
            content: {
              'application/x-ndjson': {
                schema: datasetLineSchema,
              },
            },
          },
          400: {
            description: 'Mauvais formattage de la requête',
            content: {
              'application/json': {
                schema: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    }
  }
  return endpoints
}
