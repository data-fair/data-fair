export default {
  $id: 'https://github.com/data-fair/data-fair/event',
  title: 'Event',
  'x-exports': ['types'],
  required: ['type', 'date'],
  additionalProperties: false,
  properties: {
    type: {
      type: 'string'
    },
    date: {
      type: 'string',
      format: 'date-time'
    },
    data: {
      type: 'string'
    },
    draft: {
      type: 'boolean'
    },
    store: {
      type: 'boolean' // This is used exclusively in WebSockets.
    }
  }
}
