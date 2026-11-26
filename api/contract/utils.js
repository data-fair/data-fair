export const qParam = {
  in: 'query',
  name: 'q',
  description: 'Full-text search',
  required: false,
  schema: {
    title: 'Full-text search',
    type: 'string'
  }
}

export const ownerParams = [/* {
  in: 'query',
  name: 'shared',
  description: 'Show the resources shared by other accounts',
  example: false,
  schema: {
    type: 'boolean',
    default: false
  }
}, */
  {
    in: 'query',
    name: 'mine',
    description: 'Only show the resources of my active account',
    required: false,
    schema: {
      type: 'boolean',
      default: false
    }
  }, {
    in: 'query',
    name: 'owner',
    description: 'Restrict by owner',
    required: false,
    schema: {
      title: 'Restrict by owner',
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
  description: 'Filter on the visibility of the resource.\n"public" = show the public resources\n"private" = show the private resources (those on which no particular permission was applied)\n"protected" = show the protected resources (those on which a permission was given to some users).',
  required: false,
  schema: {
    title: 'Filter on the visibility of the resource.',
    type: 'array',
    items: {
      type: 'string',
      oneOf: [
        {
          const: 'public',
          title: 'Public resources'
        },
        {
          const: 'private',
          title: 'Private resources'
        },
        {
          const: 'protected',
          title: 'Protected resources'
        }
      ]
    }
  },
  style: 'form',
  explode: false
}]

/**
 * Builds a `select` query parameter restricted to the given list of allowed column keys.
 * @param {string[]} values
 * @returns {Record<string, any>}
 */
export const selectParam = (values) => ({
  in: 'query',
  name: 'select',
  description: 'The list of columns to return',
  required: false,
  schema: {
    title: 'The list of columns to return',
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
 * Builds an array-typed query parameter used for list filtering, optionally restricted to an enum of values.
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
 * Builds a simple boolean query parameter (typically used as a feature switch).
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
  description: 'Page number',
  required: false,
  schema: {
    title: 'Page number',
    type: 'integer',
    default: 1,
    minimum: 1
  }
}, {
  in: 'query',
  name: 'size',
  description: 'Page size. The sum of the size and of the offset (page - 1) × size cannot exceed 10000.',
  required: false,
  schema: {
    title: 'Page size',
    type: 'integer',
    default: 12,
    minimum: 0,
    maximum: 10000
  }
}]
