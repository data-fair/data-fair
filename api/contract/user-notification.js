// a plain string, or one string per locale ({ fr, en }) that the events service picks per subscription
const i18nString = { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: 'string' } }] }

export default {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'title'],
  properties: {
    topic: { type: 'string' },
    title: i18nString,
    body: i18nString,
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
