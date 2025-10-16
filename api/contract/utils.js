export const idParam = {
  in: 'path',
  name: 'id',
  description: 'Identifiant',
  required: true,
  schema: {
    title: 'Identifiant',
    type: 'string'
  }
}

export const qParam = {
  in: 'query',
  name: 'q',
  description: 'Recherche textuelle',
  required: false,
  schema: {
    title: 'Recherche textuelle',
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
    required: false,
    schema: {
      type: 'boolean',
      default: true
    }
  }, {
    in: 'query',
    name: 'owner',
    description: 'Restreindre par propriétaire',
    required: false,
    schema: {
      title: 'Restreindre par propriétaire',
      type: 'array',
      items: {
        type: 'string',
        examples: [
          'organization:myorg',
          'user:myuser'
        ]
      }
    },
    style: 'form',
    explode: false
  }]

export const visibilityParams = [{
  in: 'query',
  name: 'visibility',
  description: 'Filtrer sur la visibilité de la ressource.\n"public" = voir les ressources publiques\n"private" = voir les ressources privées (celles sur lesquelles aucune permission particulière n\'a été appliquée)\n"protected" = voir les ressources protégées (celles sur lesquelles une permission a été donnée à des utilisateurs).',
  required: false,
  schema: {
    title: 'Filtrer sur la visibilité de la ressource.',
    type: 'array',
    items: {
      type: 'string',
      oneOf: [
        {
          const: 'public',
          title: 'Ressources publiques'
        },
        {
          const: 'private',
          title: 'Ressources privées'
        },
        {
          const: 'protected',
          title: 'Ressources protégées'
        }
      ]
    }
  },
  style: 'form',
  explode: false
}]

/**
 * @param {string[]} values
 * @returns {Record<string, any>}
 */
export const selectParam = (values) => ({
  in: 'query',
  name: 'select',
  description: 'La liste des colonnes à retourner',
  required: false,
  schema: {
    title: 'La liste des colonnes à retourner',
    type: 'array',
    items: {
      type: 'string',
      enum: values
    }
  },
  style: 'form',
  explode: false
})

/**
 * @param {string} name
 * @param {string} title
 * @param {string?} description
 * @param {string[]?} values
 * @returns {Record<string, any>}
 */
export const filterParam = (name, title, description = null, values = null) => {
  const p = {
    in: 'query',
    name,
    description: description ?? title,
    required: false,
    schema: {
      title,
      type: 'array',
      items: {
        type: 'string'
      }
    },
    style: 'form',
    explode: false
  }
  // @ts-ignore
  if (values) p.schema.items.enum = values
  return p
}

/**
 * @param {string} name
 * @param {string} title
 * @param {string?} description
 * @returns {Record<string, any>}
 */
export const booleanParam = (name, title, description = null) => ({
  in: 'query',
  name,
  description: description ?? title,
  required: false,
  schema: {
    title,
    type: 'boolean'
  }
})

export const paginationParams = [{
  in: 'query',
  name: 'page',
  description: 'Numéro de page',
  required: false,
  schema: {
    title: 'Numéro de page',
    type: 'integer',
    default: 1,
    min: 1
  }
}, {
  in: 'query',
  name: 'size',
  description: 'Taille de la page',
  required: false,
  schema: {
    title: 'Taille de la page',
    type: 'integer',
    default: 12,
    min: 1
  }
}]
