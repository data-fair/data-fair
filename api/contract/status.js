export default {
  title: 'Statut du service',
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['ok', 'error'],
      description: 'Si le service fonctionne correctement ou non'
    },
    message: {
      type: 'string',
      description: "Description de l'état du service en une phrase"
    },
    details: {
      type: 'array',
      description: 'Détail du statut des services utilisés',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Identifiant du service'
          },
          status: {
            type: 'string',
            enum: ['ok', 'error'],
            description: 'Si le service fonctionne correctement ou non'
          },
          details: {
            type: 'object',
            description: 'Détail du statut du service utilisé'
          }
        }
      }
    }
  }
}
