export default {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    id: {
      type: 'string',
      readOnly: true,
      layout: 'none'
    },
    title: {
      type: 'string'
    },
    color: {
      type: 'string',
      layout: { comp: 'color-picker' }
    },
    icon: {
      title: 'Icône',
      description: 'Il est possible de consulter plus facilement la liste des icones disponibles sur <a href="https://materialdesignicons.com" target="_blank">ce site</a>.',
      type: 'object',
      layout: {
        getItems: {
          url: 'https://koumoul.com/data-fair/api/v1/datasets/icons-mdi-latest/lines?q={q}',
          itemKey: 'name',
          itemTitle: 'name',
          itemIcon: 'name',
          itemsResults: 'results'
        }
      },
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
