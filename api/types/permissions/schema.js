export default {
  $id: 'https://github.com/data-fair/data-fair/permissions',
  title: 'Permissions',
  'x-exports': ['types', 'validate', 'resolvedSchema'],
  type: 'array',
  items: {
    $ref: '#/$defs/permission'
  },
  $defs: {
    permission: {
      title: 'Permission',
      type: 'object',
      description: 'Permission to do the operations (identified by their id). If type and id are not set, then the operation is set to public. roles array is used only with type organization',
      additionalProperties: false,
      properties: {
        type: {
          type: 'string',
          enum: ['user', 'organization'],
          description: 'If the entity is a user or an organization'
        },
        id: {
          type: 'string',
          description: 'Identifier of the entity'
        },
        name: {
          type: 'string',
          description: 'Name of the entity'
        },
        email: {
          type: 'string',
          description: 'Email of the user'
        },
        department: {
          type: 'string',
          description: 'Identifier of the department or "*" for any department (same as empty) or "-" for no department'
        },
        departmentName: {
          type: 'string',
          description: 'Name of the department'
        },
        roles: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Role name'
          }
        },
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
