module.exports = {
  title: 'Application keys for unauthenticated readonly access',
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        readOnly: true,
        'x-display': 'hidden'
      },
      title: { type: 'string' }
    }
  }
}
