// The `partOf` annotation is the same on every resource type: a reference to the single parent
// resource the child only exists to serve, over the weak resource ref it is stored with. Any
// resource can be the child of any other, so nothing here varies per type — only the title and
// description, which name the child, are set at the referencing site.
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
