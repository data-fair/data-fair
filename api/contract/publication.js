export default {
  type: 'object',
  required: ['catalog', 'status'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    catalog: {
      type: 'string',
      description: 'L\'identifiant du catalogue de destination de cette publication.'
    },
    status: {
      type: 'string',
      description: 'Statut indiquant clairement si la publication a réussi. Si "published", la propriété targetUrl doit être renseignée. Si "error", la propriété error doit être renseignée.',
      enum: ['waiting', 'published', 'error', 'deleted']
    },
    publishedAt: {
      type: 'string',
      description: 'Date de la dernière mise à jour de cette publication.',
      format: 'date-time'
    },
    error: {
      type: 'string'
    },
    targetUrl: {
      type: 'string'
    },
    result: {
      type: 'object',
      description: 'Résultat de la publication. La structure de cet objet est libre et dépend du type de catalogue.'
    }
  }
}
