module.exports = {
  'type': 'object',
  'additionalProperties': false,
  'required': ['type', 'id'],
  'properties': {
    'type': {
      'type': 'string',
      'enum': ['user', 'organization'],
      'description': 'If the owner is a user or an organization'
    },
    'id': {
      'type': 'string'
    },
    'name': {
      'type': 'string'
    }
  }
}
