export default (admin = false) => ({
  type: 'array',
  title: 'Portals',
  'x-i18n-title': { fr: 'Portails' },
  layout: {
    title: '',
    listActions: admin ? ['add', 'edit', 'delete'] : ['edit'],
    messages: {
      addItem: 'Add a portal',
      'x-i18n-addItem': {
        fr: 'Ajouter un portail'
      }
    },
    itemTitle: 'item.title ? item.title + (item.url ? " (" + item.url + ")" : "") : (item.url || "")'
  },
  items: {
    type: 'object',
    required: ['type', 'id', 'url'],
    layout: {
      switch: [{
        if: 'summary',
        children: []
      }]
    },
    properties: {
      type: {
        type: 'string',
        title: 'Site type',
        'x-i18n-title': { fr: 'Type de site' },
        description: 'Used to manage sites separately by groups.',
        'x-i18n-description': { fr: 'Utilisé pour séparer la gestion des sites par groupes.' },
        default: 'data-fair-portals',
        // written on a new site, the settings forms never write the schema defaults
        layout: admin ? { defaultData: 'data-fair-portals' } : 'none'
      },
      id: {
        type: 'string',
        title: 'Identifier',
        'x-i18n-title': { fr: 'Identifiant' },
        description: 'This identifier must be unique for a given "Site type".',
        'x-i18n-description': { fr: 'Cet identifiant doit être unique pour la même valeur de "Type de site".' },
        layout: admin ? {} : 'none'
      },
      department: {
        type: 'string',
        title: 'Department',
        'x-i18n-title': { fr: 'Département' },
        layout: admin ? {} : 'none'
      },
      title: {
        type: 'string',
        title: 'Title',
        'x-i18n-title': { fr: 'Titre' },
        readOnly: !admin
      },
      url: {
        type: 'string',
        title: 'Site address',
        'x-i18n-title': { fr: 'Adresse du site' },
        readOnly: !admin
      },
      draftUrl: {
        type: 'string',
        title: 'Site draft address',
        'x-i18n-title': { fr: 'Adresse du brouillon du site' },
        readOnly: !admin
      },
      private: {
        type: 'boolean',
        title: 'Private site (deprecated)',
        description: 'Depends on the authentication configuration of the portal. If checked, resources whose permissions do not allow public access can be published.',
        default: false,
        layout: 'none'
      },
      datasetUrlTemplate: {
        type: 'string',
        title: 'Dataset pages address',
        'x-i18n-title': { fr: 'Adresse des pages de jeux de données' },
        description: 'Example: https://my-portal/datasets/{id}',
        'x-i18n-description': { fr: 'Exemple: https://mon-portail/datasets/{id}' },
        layout: admin ? {} : 'none'
      },
      applicationUrlTemplate: {
        type: 'string',
        title: 'Visualization pages address',
        'x-i18n-title': { fr: 'Adresse des pages de visualisations' },
        description: 'Example: https://my-portal/reuses/{id}',
        'x-i18n-description': { fr: 'Exemple: https://mon-portail/reuses/{id}' },
        layout: admin ? {} : 'none'
      },
      settings: {
        type: 'object',
        properties: {
          staging: {
            title: 'Staging',
            'x-i18n-title': { fr: 'Pré-production' },
            description: 'If checked, contributors can publish resources without asking the administrators',
            'x-i18n-description': { fr: 'Si coché les contributeurs pourront publier des ressources sans solliciter les administrateurs' },
            type: 'boolean',
            default: false,
            readOnly: !admin
          },
          contributorDepartments: {
            type: 'array',
            title: 'Contributor departments',
            'x-i18n-title': { fr: 'Départements contributeurs' },
            description: 'Departments whose administrators can publish on this portal, as if they owned it.',
            'x-i18n-description': { fr: 'Départements dont les administrateurs peuvent publier sur ce portail, comme s\'ils en étaient propriétaires.' },
            items: { type: 'string' },
            default: [],
            readOnly: !admin
          },
          datasetsRequiredMetadata: {
            title: 'Required metadata for datasets',
            'x-i18n-title': { fr: 'Métadonnées requises pour les jeux de données' },
            type: 'array',
            items: {
              type: 'string'
            },
            layout: {
              getItems: {
                expr: 'context.DatasetsMetadata',
                itemKey: 'item.key',
                itemTitle: 'item.title'
              }
            }
          }
        }
      }
    }
  }
})
