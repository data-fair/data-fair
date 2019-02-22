exports.idParam = {
  in: 'path',
  name: 'id',
  description: 'identifiant',
  required: true,
  schema: {
    type: 'string'
  }
}

exports.qParam = {
  in: 'query',
  name: 'q',
  description: 'Recherche textuelle',
  required: false,
  schema: {
    type: 'string'
  }
}

exports.ownerParam = {
  in: 'query',
  name: 'owner',
  description: 'Restreindre sur le propriétaire',
  required: false,
  example: ['organization:myorg', 'user:myuser'],
  schema: {
    type: 'array',
    items: {
      type: 'string'
    }
  },
  style: 'commaDelimited'
}

exports.visibilityParams = [{
  in: 'query',
  name: 'public',
  description: 'Voir uniquement les ressources publiques.',
  required: false,
  schema: {
    type: 'boolean'
  }
}, {
  in: 'query',
  name: 'public',
  description: `Voir uniquement les ressources privées. Celles auxquelles vous avez accès du fait d'une permission particulière.`,
  required: false,
  schema: {
    type: 'boolean'
  }
}]

exports.selectParam = (values) => ({
  in: 'query',
  name: 'select',
  description: 'La liste des champs à retourner',
  required: false,
  schema: {
    default: ['title'],
    type: 'array',
    items: {
      type: 'string',
      enum: values
    }
  },
  style: 'commaDelimited'
})

exports.filterParam = (name, description, values) => {
  const p = {
    in: 'query',
    name,
    description,
    required: false,
    schema: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    style: 'commaDelimited'
  }
  if (values) p.schema.items.enum = values
  return p
}

exports.booleanParam = (name, description) => ({
  in: 'query',
  name,
  description,
  required: false,
  schema: {
    type: 'boolean'
  }
})

exports.paginationParams = [{
  in: 'query',
  name: 'page',
  description: 'Numéro de page (à partir de 1)',
  required: false,
  schema: {
    type: 'integer',
    default: 1
  }
}, {
  in: 'query',
  name: 'size',
  description: 'Taille de la page',
  required: false,
  schema: {
    type: 'integer',
    default: 10
  }
}]
