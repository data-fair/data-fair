module.exports = {
  type: 'array',
  title: 'Sites de publication',
  items: {
    type: 'object',
    required: ['type', 'id', 'url'],
    properties: {
      type: {
        type: 'string',
        title: 'Type de site',
        description: 'Utilisé pour séparer la gestion des sites par groupes.',
        default: 'data-fair-portals',
      },
      id: {
        type: 'string',
        title: 'Identifiant',
        description: 'Cet identifiant doit être unique pour la même valeur de "Type de site".',
      },
      title: {
        type: 'string',
        title: 'Titre',
      },
      url: {
        type: 'string',
        title: 'Adresse du site',
      },
      private: {
        type: 'boolean',
        title: 'Site privé',
        description: 'Possible uniquement sur un portail qui partage le domaine d\'authentification avec ce service.',
        default: false,
      },
      datasetUrlTemplate: {
        type: 'string',
        title: 'Adresse des pages de jeux de données',
        description: 'Exemple: https://mon-portail/datasets/{id}',
      },
      applicationUrlTemplate: {
        type: 'string',
        title: 'Adresse des pages de visualisations',
        description: 'Exemple: https://mon-portail/reuses/{id}',
      },
    },
  },
}
