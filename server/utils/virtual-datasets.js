const datasetUtils = require('./dataset')
const createError = require('http-errors')

// blacklisted fields are fields that are present in a grandchild but not re-exposed
// by the child.. it must not be possible to access those fields in the case
// of another child having the same key
async function childrenSchemas (db, owner, children, blackListedFields) {
  let schemas = []
  for (const childId of children) {
    const child = await db.collection('datasets')
      .findOne({
        id: childId,
        $or: [
          // the virtual dataset can have children that are either from the same owner
          // or completely public for the "read" opeations classes
          // we could try to manage intermediate cases, but it would be complicated
          { 'owner.id': owner.id, 'owner.type': owner.type },
          { permissions: { $elemMatch: { classes: 'read', type: null, id: null } } }
        ]
      }, { isVirtual: 1, virtual: 1, schema: 1 })
    if (!child) continue
    if (child.isVirtual) {
      const grandChildrenSchemas = await childrenSchemas(db, owner, child.virtual.children, blackListedFields)
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

    // we used to have null values, better to just have absent info
    matchingFields.forEach(f => {
      if (!f.format) delete f.format
      if (!f['x-refersTo']) delete f['x-refersTo']
      if (!f.separator) delete f.separator
    })

    // we take the first child field as reference
    field.title = field.title || matchingFields[0].title || ''
    field.description = field.description || matchingFields[0].description || ''
    field.type = matchingFields[0].type
    if (matchingFields[0].format) field.format = matchingFields[0].format
    else delete field.format
    // ignore "uri-reference" format, it is not significant anymore
    if (field.format === 'uri-reference') delete field.format
    if (matchingFields[0]['x-refersTo']) field['x-refersTo'] = matchingFields[0]['x-refersTo']
    else delete field['x-refersTo']
    if (matchingFields[0].separator) field.separator = matchingFields[0].separator
    else delete field.separator

    // Some attributes of a a fields have to be homogeneous accross all children
    matchingFields.forEach(f => {
      if (f.type !== field.type) {
        let message = `Le champ "${field.key}" a des types contradictoires (${field.type}, ${f.type}).`
        if (['number', 'integer'].includes(field.type) && ['number', 'integer'].includes(f.type)) {
          message += ' Vous pouvez corriger cette incohérence en forçant le traitement des colonnes comme des nombres flottants dans tous les jeux enfants.'
        }
        throw createError(400, message)
      }
      if (f.separator !== field.separator) throw createError(400, `Le champ "${field.key}" a des séparateurs contradictoires  (${field.separator}, ${f.separator}).`)
      let format = f.format
      if (format === 'uri-reference') format = undefined
      if (format !== field.format) throw createError(400, `Le champ "${field.key}" a des formats contradictoires (${field.format || 'non défini'}, ${f.format || 'non défini'}).`)
      if (f['x-refersTo'] !== field['x-refersTo']) throw createError(400, `Le champ "${field.key}" a des concepts contradictoires (${field['x-refersTo'] || 'non défini'}, ${f['x-refersTo'] || 'non défini'}).`)
      field['x-capabilities'] = field['x-capabilities'] || {}
      for (const key in f['x-capabilities'] || {}) {
        if (f['x-capabilities'][key] === false) field['x-capabilities'][key] = false
      }
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
exports.descendants = async (db, dataset, extraProperties) => {
  const project = {
    'descendants.id': 1,
    'descendants.isVirtual': 1,
    'descendants.virtual': 1
  }
  if (extraProperties) extraProperties.forEach(p => { project['descendants.' + p] = 1 })
  const res = await db.collection('datasets').aggregate([{
    $match: {
      id: dataset.id
    }
  }, {
    $graphLookup: {
      from: 'datasets',
      startWith: '$virtual.children',
      connectFromField: 'virtual.children',
      connectToField: 'id',
      as: 'descendants',
      maxDepth: 20,
      restrictSearchWithMatch: {
        $or: [
          // the virtual dataset can have children that are either from the same owner
          // or completely public for the "read" opeations classes
          // we could try to manage intermediate cases, but it would be complicated
          { 'owner.id': dataset.owner.id, 'owner.type': dataset.owner.type },
          { permissions: { $elemMatch: { classes: 'read', type: null, id: null } } }
        ]
      }
    }
  }, {
    $project: project
  }]).toArray()
  if (!res[0]) return []
  const virtualDescendantsWithFilters = res[0].descendants
    .filter(d => d.isVirtual && d.virtual.filters && d.virtual.filters.length)
  if (virtualDescendantsWithFilters.length) {
    throw createError(501, 'Le jeu de données virtuel ne peut pas être requêté, il agrège un autre jeu de données virtuel avec des filtres dont nous ne pouvons pas garantir l\'application.')
  }
  const physicalDescendants = res[0].descendants.filter(d => !d.isVirtual)
  if (physicalDescendants.length === 0) {
    throw createError(501, 'Le jeu de données virtuel ne peut pas être requêté, il n\'agrège aucun jeu de données physique.')
  }
  return extraProperties ? physicalDescendants : physicalDescendants.map(d => d.id)
}
