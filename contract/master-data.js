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
                title: 'Date en entrée comprise dans l\'interval',
                'x-if': 'context.hasDateIntervalConcepts',
                properties: {
                  type: { type: 'string', const: 'date-interval' },
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

  const datasetLineSchema = {
    type: 'object',
    properties: dataset.schema.reduce((a, f) => { a[f.key] = { ...f, title: f.title || f['x-originalName'] || f.key }; delete a[f.key].key; return a }, {}),
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

  const properties = dataset.schema.map(p => p.key)

  for (const bulkSearch of dataset.masterData.bulkSearchs) {
    const inputProperties = {}
    for (const input of bulkSearch.input) {
      const matchingProp = dataset.schema.find(p => p.key === input.property.key)
      inputProperties[input.property.key] = matchingProp ? { ...matchingProp } : { ...input.property }
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
