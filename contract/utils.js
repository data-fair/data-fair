export const idParam = {
  in: 'path',
  name: 'id',
  description: 'identifiant',
  required: true,
  schema: {
    type: 'string'
  }
}

export const qParam = {
  in: 'query',
  name: 'q',
  description: 'Recherche textuelle',
  required: false,
  schema: {
    type: 'string'
  }
}

export const ownerParams = [/* {
  in: 'query',
  name: 'shared',
  description: 'Voir les ressources partagées par d\'autres comptes',
  example: false,
  schema: {
    type: 'boolean',
    default: false
  }
}, */
  {
    in: 'query',
    name: 'mine',
    description: 'Voir uniquement les ressources de mon compte actif',
    example: true,
    schema: {
      type: 'boolean'
    }
  }, {
    in: 'query',
    name: 'owner',
    description: 'Restreindre sur le propriétaire (par exemple "organization:myorg" ou "user:myuser")',
    required: false,
    schema: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    style: 'form',
    explode: false
  }]

export const visibilityParams = [{
  in: 'query',
  name: 'visibility',
  description: 'Filtrer sur la visibilité de la ressource. "public" = voir les ressources publiques, "private" = voir les ressources privées (celles sur lesquelles aucune permission particulière n\'a été appliquée), "protected" = voir les ressources protégées (celles sur lesquelles une permission a été donnée à des utilisateurs).',
  require: 'false',
  schema: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['public', 'private', 'protected']
    }
  },
  style: 'form',
  explode: false
}]

export const selectParam = (values) => ({
  in: 'query',
  name: 'select',
  description: 'La liste des colonnes à retourner',
  required: false,
  schema: {
    default: ['title'],
    type: 'array',
    items: {
      type: 'string',
      enum: values
    }
  },
  style: 'form',
  explode: false
})

export const filterParam = (name, description, values) => {
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
    style: 'form',
    explode: false
  }
  if (values) p.schema.items.enum = values
  return p
}

export const booleanParam = (name, description) => ({
  in: 'query',
  name,
  description,
  required: false,
  schema: {
    type: 'boolean'
  }
})

export const paginationParams = [{
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
