exports.writable = {
  title: 'Dataset API keys for unauthenticated access',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: {
        type: 'string',
        readOnly: true,
        'x-display': 'hidden'
      },
      storeClearKey: {
        type: 'boolean',
        default: false
      },
      clearKey: {
        type: 'string',
        readOnly: true
      },
      key: {
        type: 'string',
        readOnly: true
      },
      title: { type: 'string' },
      permissions: {
        type: 'object',
        additionalProperties: false,
        anyOf: [{
          required: ['operations']
        },
        {
          required: ['classes']
        }],
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'string',
              description: 'API operation that can be used'
            }
          },
          classes: {
            type: 'array',
            items: {
              type: 'string',
              description: 'API permission classes that can be used'
            }
          }
        }
      }
    }
  }
}

exports.stored = {
  ...exports.writable,
  items: {
    ...exports.writable.items,
    required: ['id', 'title', 'clearKey', 'key', 'permissions']
  }
}
