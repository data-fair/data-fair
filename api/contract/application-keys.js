export default {
  title: 'Application keys for unauthenticated readonly access',
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        readOnly: true,
        layout: 'none'
      },
      title: { type: 'string' }
    }
  }
}
