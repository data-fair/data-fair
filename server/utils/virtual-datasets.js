const datasetUtils = require('./dataset')
const createError = require('http-errors')

// blacklisted fields are fields that are present in a grandchild but not re-exposed
// by the child.. it must not be possible to access those fields in the case
// of another child having the same key
async function childrenSchemas(db, owner, children, blackListedFields) {
  let schemas = []
  for (const childId of children) {
    const child = await db.collection('datasets')
      .findOne({ id: childId, 'owner.id': owner.id, 'owner.type': owner.type }, { fields: { isVirtual: 1, virtual: 1, schema: 1 } })
    if (!child) continue
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
exports.prepareSchema = async (db, dataset) => {
  if (!dataset.virtual.children || !dataset.virtual.children.length) return []
  dataset.schema = dataset.schema || []
  const schema = datasetUtils.extendedSchema(dataset)
  const blackListedFields = new Set([])
  const schemas = await childrenSchemas(db, dataset.owner, dataset.virtual.children, blackListedFields)
  schema.forEach(field => {
    if (blackListedFields.has(field.key)) {
      throw createError(400, `Le champ "${field.key}" est interdit. Il est présent dans un jeu de données enfant mais est protégé.`)
    }
    const matchingFields = []
    schemas.filter(s => !!s).forEach(s => s.filter(f => f.key === field.key).forEach(f => matchingFields.push(f)))
    if (!matchingFields.length) {
      field = null
      return
    }
    field.type = field.type || matchingFields[0].type
    field.format = field.format || matchingFields[0].format || null
    // ignore "uri-reference" format, it is not significant anymore
    if (field.format === 'uri-reference') field.format = null
    field['x-refersTo'] = field['x-refersTo'] || matchingFields[0]['x-refersTo'] || null
    matchingFields.forEach(f => {
      // Some attributes of a a fields have to be homogeneous accross all children
      if (f.type !== field.type) throw createError(400, `Le champ "${field.key}" a des types contradictoires (${field.type}, ${f.type})`)
      let format = f.format || null
      if (format === 'uri-reference') format = null
      if (format !== field.format) throw createError(400, `Le champ "${field.key}" a des formats contradictoires (${field.format || 'non défini'}, ${f.format || 'non défini'})`)
      if ((f['x-refersTo'] || null) !== field['x-refersTo']) throw createError(400, `Le champ "${field.key}" a des concepts contradictoires (${field['x-refersTo'] || 'non défini'}, ${f['x-refersTo'] || 'non défini'})`)
      // For others we take the first defined value
      field.title = field.title || f.title
      field.description = field.title || f.title
    })
  })

  const fieldsByConcept = {}
  schema.filter(f => !!f).filter(f => f['x-refersTo']).forEach(f => {
    if (fieldsByConcept[f['x-refersTo']]) throw createError(400, `Le concept "${f['x-refersTo']}" est référencé par plusieurs champs (${fieldsByConcept[f['x-refersTo']]}, ${f.key}).`)
    fieldsByConcept[f['x-refersTo']] = f.key
  })

  return schema.filter(f => !!f)
}

// Only non virtual descendants on which to perform the actual ES queries
exports.descendants = async (db, dataset) => {
  const res = await db.collection('datasets').aggregate([{
    $match: {
      id: dataset.id,
    },
  }, {
    $graphLookup: {
      from: 'datasets',
      startWith: '$virtual.children',
      connectFromField: 'virtual.children',
      connectToField: 'id',
      as: 'descendants',
      maxDepth: 20,
      restrictSearchWithMatch: { 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id },
    },
  }, {
    $project: {
      'descendants.id': 1,
      'descendants.isVirtual': 1,
      'descendants.virtual': 1,
    },
  }]).toArray()
  const virtualDescendantsWithFilters = res[0].descendants
    .filter(d => d.isVirtual && d.virtual.filters && d.virtual.filters.length)
  if (virtualDescendantsWithFilters.length) {
    throw createError(501, 'Le jeu de données virtuel ne peut pas être requêté, il agrège un autre jeu de données virtuel avec des filtres dont nous ne pouvons pas garantir l\'application.')
  }
  const physicalDescendants = res[0].descendants.filter(d => !d.isVirtual).map(d => d.id)
  if (physicalDescendants.length === 0) {
    throw createError(501, 'Le jeu de données virtuel ne peut pas être requêté, il n\'agrège aucun jeu de données physique.')
  }
  return physicalDescendants
}
