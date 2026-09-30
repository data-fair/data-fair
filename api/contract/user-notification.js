export default {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'title'],
  properties: {
    topic: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    urlParams: { type: 'object' },
    recipient: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' }, name: { type: 'string' } }
    },
    visibility: { type: 'string' }
  }
}
