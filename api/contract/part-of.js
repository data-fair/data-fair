// the partOf annotation: a weak ref to the single parent resource the child only exists to serve
export default {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'id'],
  properties: {
    type: {
      type: 'string',
      title: 'Type de la ressource parente',
      enum: ['dataset', 'application']
    },
    id: {
      type: 'string',
      title: 'Identifiant de la ressource parente'
    },
    title: {
      type: 'string',
      title: 'Titre de la ressource parente'
    }
  }
}
