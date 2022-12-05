module.exports = (admin = false) => ({
  type: 'array',
  title: 'Portails',
  'x-options': admin ? {} : { arrayOperations: ['update'] },
  items: {
    type: 'object',
    required: ['type', 'id', 'url'],
    properties: {
      type: {
        type: 'string',
        title: 'Type de site',
        description: 'Utilisé pour séparer la gestion des sites par groupes.',
        default: 'data-fair-portals',
        'x-display': admin ? null : 'hidden'
      },
      id: {
        type: 'string',
        title: 'Identifiant',
        description: 'Cet identifiant doit être unique pour la même valeur de "Type de site".',
        'x-display': admin ? null : 'hidden'
      },
      title: {
        type: 'string',
        title: 'Titre',
        readOnly: !admin
      },
      url: {
        type: 'string',
        title: 'Adresse du site',
        readOnly: !admin
      },
      private: {
        type: 'boolean',
        title: 'Site privé',
        description: 'Dépend de la configuration de l\'authentification sur le portail. Si coché il sera permis de publier des ressources dont les permissions ne permettent pas l\'accès au public.',
        default: false,
        readOnly: !admin
      },
      datasetUrlTemplate: {
        type: 'string',
        title: 'Adresse des pages de jeux de données',
        description: 'Exemple: https://mon-portail/datasets/{id}',
        'x-display': admin ? null : 'hidden'
      },
      applicationUrlTemplate: {
        type: 'string',
        title: 'Adresse des pages de visualisations',
        description: 'Exemple: https://mon-portail/reuses/{id}',
        'x-display': admin ? null : 'hidden'
      },
      settings: {
        type: 'object',
        properties: {
          staging: {
            title: 'Pré-production',
            description: 'Si coché les contributeurs pourront publier des ressources sans solliciter les administrateurs',
            type: 'boolean',
            default: false
          },
          datasetsRequiredMetadata: {
            title: 'Métadonnées requises pour les jeux de données',
            type: 'array',
            'x-fromData': 'context.datasetsMetadata',
            items: {
              type: 'string'
            }
          }
        }
      }
    }
  }
})
