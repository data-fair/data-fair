module.exports = {
  type: 'array',
  description: 'Le tableau de résultats.',
  items: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
      },
      size: {
        type: 'number',
      },
      name: {
        type: 'string',
      },
      mimetype: {
        type: 'string',
      },
      updatedAt: {
        type: 'string',
        format: 'date-time',
      },
      title: {
        type: 'string',
      },
      url: {
        type: 'string',
      },
    },
  },
}
