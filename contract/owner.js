module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'id'],
  properties: {
    type: {
      type: 'string',
      enum: ['user', 'organization'],
      description: 'If the owner is a user or an organization'
    },
    id: {
      type: 'string',
      description: 'The unique id of the user or organization'
    },
    name: {
      type: 'string',
      description: 'The display name of the user or organization'
    },
    role: {
      type: 'string',
      deprecated: true,
      description: 'DEPRECATED - If this is set and owner is an organization, this restrict ownership to users of this organization having this role or admin role'
    },
    department: {
      type: 'string',
      description: 'If this is set and owner is an organization, this gives ownership to users of this organization that belong to this department'
    }
  }
}
