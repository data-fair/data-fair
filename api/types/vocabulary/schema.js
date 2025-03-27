export default {
  $id: 'https://github.com/data-fair/data-fair/vocabulary',
  title: 'Vocabulary',
  'x-exports': ['types'],
  required: ['id', 'title', 'description', 'identifiers', 'type', 'tag'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    identifiers: {
      type: 'array',
      items: { type: 'string' }
    },
    type: { type: 'string' },
    tag: { type: 'string' },
    format: { type: 'string' }
  }
}
