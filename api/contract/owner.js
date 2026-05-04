export default {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'id', 'name'],
  properties: {
    type: {
      type: 'string',
      enum: ['user', 'organization'],
      description: 'Indique si le propriétaire est un utilisateur ou une organisation.'
    },
    id: {
      type: 'string',
      description: 'Identifiant unique de l\'utilisateur ou de l\'organisation.'
    },
    name: {
      type: 'string',
      description: 'Nom affiché de l\'utilisateur ou de l\'organisation.'
    },
    role: {
      type: 'string',
      deprecated: true,
      description: 'DÉPRÉCIÉ - Si cette propriété est renseignée et que le propriétaire est une organisation, restreint la propriété aux utilisateurs de cette organisation ayant ce rôle ou le rôle administrateur.'
    },
    department: {
      type: 'string',
      description: 'Si cette propriété est renseignée et que le propriétaire est une organisation, restreint la propriété aux utilisateurs de cette organisation appartenant à ce département.'
    },
    departmentName: {
      type: 'string',
      description: 'Nom affiché du département.'
    }
  }
}
