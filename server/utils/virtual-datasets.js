const createError = require('http-errors')

// blacklisted fields are fields that are present in a grandchild but not re-exposed
// by the child.. it must not be possible to access those fields in the case
// of another child having the same key
async function childrenSchemas(db, children, blackListedFields) {
  let schemas = []
  for (let childId of children) {
    const child = await db.collection('datasets').findOne({ id: childId }, { fields: { isVirtual: 1, virtual: 1, schema: 1 } })
    if (child.isVirtual) {
      const grandChildrenSchemas = await childrenSchemas(db, child.virtual.children, blackListedFields)
      grandChildrenSchemas.forEach(s => s.forEach(field => {
        if (!child.schema.find(f => f.key === field.key)) blackListedFields.add(field.key)
      }))
      schemas.push(child.schema)
      schemas = schemas.concat(grandChildrenSchemas)
    } else {
      schemas.push(child.schema)
    }
  }
  return schemas
}

// Validate and fill a virtual dataset schema based on its children
exports.prepareSchema = async (db, schema, virtual) => {
  const blackListedFields = new Set([])
  const schemas = await childrenSchemas(db, virtual.children, blackListedFields)
  schema.forEach(field => {
    if (blackListedFields.has(field.key)) {
      throw createError(400, `Le champ "${field.key}" est interdit. Il est présent dans un jeu de données enfant mais est protégé.`)
    }
    const matchingFields = []
    schemas.forEach(s => s.filter(f => f.key === field.key).forEach(f => matchingFields.push(f)))
    if (!matchingFields.length) {
      throw createError(400, `Le champ "${field.key}" n'est présent dans aucun jeu de données enfant`)
    }
    field.type = field.type || matchingFields[0].type
    field.format = field.format || matchingFields[0].format
    matchingFields.forEach(f => {
      if (f.type !== field.type) throw createError(400, `Le champ "${field.key}" a des types contradictoires (${field.type}, ${f.type})`)
      if (f.format !== field.format) throw createError(400, `Le champ "${field.key}" a des formats contradictoires (${field.format}, ${f.format})`)
      field.title = field.title || f.title
      field.description = field.title || f.title
      field['x-refersTo'] = field['x-refersTo'] || f['x-refersTo']
    })
  })
  return schema
}
