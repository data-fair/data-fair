export default {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'id', 'name'],
  properties: {
    type: {
      type: 'string',
      enum: ['user', 'organization'],
      description: 'Whether the owner is a user or an organization.'
    },
    id: {
      type: 'string',
      description: 'Unique identifier of the user or organization.'
    },
    name: {
      type: 'string',
      description: 'Display name of the user or organization.'
    },
    role: {
      type: 'string',
      deprecated: true,
      description: 'DEPRECATED - If set and the owner is an organization, restricts the ownership to the users of this organization having this role or the admin role.'
    },
    department: {
      type: 'string',
      description: 'If set and the owner is an organization, restricts the ownership to the users of this organization belonging to this department.'
    },
    departmentName: {
      type: 'string',
      description: 'Display name of the department.'
    }
  }
}
