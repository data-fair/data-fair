exports.schema = {
  type: 'object',
  required: ['id', 'title'],
  properties: {
    id: { type: 'string', title: 'Identifiant' },
    title: { type: 'string', title: 'Titre' },
    description: { type: 'string', title: 'Description', 'x-display': 'textarea' },
    input: {
      type: 'array',
      title: 'Champs pivots',
      minItems: 1,
      'x-options': { editMode: 'inline' },
      items: { type: 'string', title: 'Clé' },
    },
  },
}

exports.endpoints = (dataset) => {
  const endpoints = {}
  if (!dataset.masterData) return endpoints

  const datasetLineSchema = {
    type: 'object',
    properties: dataset.schema.reduce((a, f) => { a[f.key] = { ...f }; delete a[f.key].key; return a }, {}),
  }
  datasetLineSchema.properties._key = {
    description: 'Identifiant de la ligne de requête',
    type: 'string',
    'x-refersTo': 'http://schema.org/identifier',
  }
  datasetLineSchema.properties._error = {
    type: 'string',
    title: 'Erreur de récupération de données de référence',
    description: 'Une erreur lors de la récupération des informations',
  }

  const properties = dataset.schema.map(p => p.key)

  for (const masterData of dataset.masterData) {
    const inputProperties = {}
    for (const input of masterData.input) {
      const prop = dataset.schema.find(p => p.key === input)
      if (!prop) {
        inputProperties[input] = {
          title: `Définition de données de référence invalide, la colonne ${input} n'existe pas`,
        }
      } else {
        inputProperties[input] = {
          title: prop.title,
          description: prop.description,
          type: prop.type,
          'x-refersTo': prop['x-refersTo'],
        }
      }
    }
    inputProperties._key = {
      description: 'Identifiant de la ligne de requête',
      type: 'string',
      'x-refersTo': 'http://schema.org/identifier',
    }

    endpoints[`/masterData/${masterData.id}/_bulk_search`] = {
      post: {
        tags: [
          'Données de référence',
        ],
        summary: masterData.title,
        description: masterData.description || '',
        operationId: `masterData_${masterData._id}_bulkSearch`,
        'x-operationType': 'http://schema.org/SearchAction',
        'x-permissionClass': 'read',
        parameters: [{
          in: 'query',
          name: 'select',
          description: 'La liste des champs à retourner',
          schema: {
            default: ['*'],
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
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  title: 'Filtre pour une ligne',
                  type: 'object',
                  properties: inputProperties,
                },
              },
            },
            'application/x-ndjson': {
              schema: {
                title: 'Filtre pour un établissement',
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
              'application/json': {
                schema: {
                  type: 'array',
                  items: datasetLineSchema,
                },
              },
              'application/xnd-json': {
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
