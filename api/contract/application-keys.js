export default {
  title: 'Clés d\'application pour un accès anonyme en lecture seule',
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
