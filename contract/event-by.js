module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
  },
}
