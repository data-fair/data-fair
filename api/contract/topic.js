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
      title: 'Icon',
      description: 'The list of available icons can be browsed on <a href="https://materialdesignicons.com" target="_blank">this website</a>.',
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
