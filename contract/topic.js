module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    id: {
      type: 'string',
      readOnly: true,
      'x-display': 'hidden'
    },
    title: {
      type: 'string'
    },
    color: {
      type: 'string',
      'x-display': 'color-picker'
    }
  }
}
