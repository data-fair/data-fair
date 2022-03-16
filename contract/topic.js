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
    },
    icon: {
      title: 'Icône',
      description: 'Il est possible de consulter plus facilement la liste des icones disponibles sur <a href="https://materialdesignicons.com" target="_blank">ce site</a>.',
      type: 'object',
      'x-fromUrl': 'https://koumoul.com/s/data-fair/api/v1/datasets/icons-mdi-latest/lines?q={q}',
      'x-itemKey': 'name',
      'x-itemTitle': 'name',
      'x-itemIcon': 'svg',
      'x-itemsProp': 'results',
      properties: {
        name: {
          type: 'string'
        },
        svg: {
          type: 'string'
        }
      }
    }
  }
}
