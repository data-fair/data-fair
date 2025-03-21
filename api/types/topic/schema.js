export default {
  $id: 'https://github.com/data-fair/data-fair/topic',
  title: 'Topic',
  'x-exports': ['types', 'schema'],
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      readOnly: true
    },
    title: {
      type: 'string',
      title: 'Title',
      'x-i18n-title': {
        fr: 'Titre'
      }
    },
    color: {
      type: 'string',
      title: 'Color',
      'x-i18n-title': {
        fr: 'Couleur'
      },
      layout: {
        comp: 'color-picker',
        cols: 6
      }
    },
    icon: {
      type: 'object',
      title: 'Icon',
      'x-i18n-title': {
        fr: 'Icône'
      },
      description: "You can easily browse the list of available icons on this <a href='https://pictogrammers.com/library/mdi/' target='_blank'>this website</a>.<br>Start typing to search through the complete collection of icons. Only a few icons are loaded initially for better performance.",
      'x-i18n-description': {
        fr: "Il est possible de consulter plus facilement la liste des icônes disponibles sur <a href='https://pictogrammers.com/library/mdi/' target='_blank'>ce site </a>.<br>Commencez à taper pour rechercher dans la collection complète d'icônes. Seuls quelques icônes sont chargées initialement pour de meilleures performances."
      },
      layout: {
        getItems: {
          url: 'https://koumoul.com/data-fair/api/v1/datasets/icons-mdi-latest/lines?q={q}&select=name,svg&size=25',
          itemsResults: 'data.results',
          itemTitle: 'item.name',
          itemIcon: 'item.svg',
          itemKey: 'item.name'
        },
        cols: 6
      }
    }
  }
}
