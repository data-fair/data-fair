exports.schema = {
  type: 'obect',
  required: ['id', 'title'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    input: {
      type: 'array',
      items: {
        type: 'string',
      },
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
  datasetLineSchema._key = {
    description: 'Identifiant de la ligne de requête',
    type: 'string',
    'x-refersTo': 'http://schema.org/identifier',
  }
  datasetLineSchema._error = {
    type: 'string',
    title: 'Erreur de récupération de données de référence',
    description: 'Une erreur lors de la récupération des informations',
  }

  const properties = dataset.schema.map(p => p.key)

  for (const masterData of dataset.masterData) {
    const inputProperties = {}
    for (const input of masterData.input) {
      const prop = dataset.schema.find(p => p.key === input)
      if (!prop) throw new Error(`Définition de données de référence invalide, la colonne ${input} n'existe pas`)
      inputProperties[input] = {
        title: prop.title,
        description: prop.description,
        type: prop.type,
        'x-refersTo': prop['x-refersTo'],
      }
    }
    inputProperties._key = {
      description: 'Identifiant de la ligne de requête',
      type: 'string',
      'x-refersTo': 'http://schema.org/identifier',
    }

    endpoints['masterData/{id}/lines'] = {
      post: {
        tags: [
          'Données de référence',
        ],
        summary: masterData.title,
        description: masterData.description || '',
        operationId: `masterData_${masterData._id}_lines`,
        'x-operationType': 'http://schema.org/SearchAction',
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
}
