import mongo from '#mongo'
import * as datasetUtils from '../../datasets/utils/index.js'
import capabilitiesSchema from '../../../contract/capabilities.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { AccountKeys } from '@data-fair/lib-express'
import type { Dataset, VirtualDataset } from '#types'

// blacklisted fields are fields that are present in a grandchild but not re-exposed
// by the child.. it must not be possible to access those fields in the case
// of another child having the same key
async function childrenSchemas (owner: AccountKeys, children: string[], blackListedFields: Set<string>) {
  let schemas: any[] = []
  for (const childId of children) {
    const child = await mongo.datasets
      .findOne({
        id: childId,
        $or: [
          // the virtual dataset can have children that are either from the same owner
          // or completely public for the "read" operations classes
          // we could try to manage intermediate cases, but it would be complicated
          { 'owner.id': owner.id, 'owner.type': owner.type },
          { permissions: { $elemMatch: { classes: 'read', type: null, id: null } } }
        ]
      }, { projection: { isVirtual: 1, virtual: 1, schema: 1 } })
    if (!child) continue
    if (child.isVirtual && child.virtual) {
      const grandChildrenSchemas = await childrenSchemas(owner, child.virtual.children, blackListedFields)
      for (const s of grandChildrenSchemas) {
        for (const field of s) {
          if (!child.schema?.find(f => f.key === field.key)) blackListedFields.add(field.key)
        }
      }
      schemas.push(child.schema)
      schemas = schemas.concat(grandChildrenSchemas)
    } else {
      schemas.push(child.schema)
    }
  }
  return schemas
}

// Validate and fill a virtual dataset schema based on its children
// @ts-ignore
const capabilitiesDefaultFalse = Object.keys(capabilitiesSchema.properties).filter((key: string) => capabilitiesSchema.properties[key]?.default === false)
export const prepareSchema = async (dataset: VirtualDataset) => {
  if (!dataset.virtual.children || !dataset.virtual.children.length) return []
  dataset.schema = dataset.schema || []
  for (const field of dataset.schema) delete field['x-extension']
  const schema = await datasetUtils.extendedSchema(mongo.db, dataset)
  const blackListedFields = new Set<string>([])
  const schemas = await childrenSchemas(dataset.owner, dataset.virtual.children, blackListedFields)
  for (const field of schema) {
    if (blackListedFields.has(field.key)) {
      throw httpError(400, `Le champ "${field.key}" est interdit. Il est présent dans un jeu de données enfant mais est protégé.`)
    }
    const matchingFields = []
    for (const s of schemas) {
      if (!s) continue
      for (const f of s) {
        if (f.key === field.key) matchingFields.push(f)
      }
    }
    if (!matchingFields.length) continue

    // we used to have null values, better to just have absent info
    for (const f of matchingFields) {
      if (!f.format) delete f.format
      if (!f['x-refersTo']) delete f['x-refersTo']
      if (!f.separator) delete f.separator
    }

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
    if (matchingFields[0]['x-display']) field['x-display'] = matchingFields[0]['x-display']
    else delete field['x-display']

    // Some attributes of a field have to be homogeneous accross all children
    field['x-capabilities'] = {}
    const xLabels: Record<string, string> = {}
    for (const f of matchingFields) {
      if (f.type !== field.type) {
        let message = `Le champ "${field.key}" a des types contradictoires (${field.type}, ${f.type}).`
        if (['number', 'integer'].includes(field.type) && ['number', 'integer'].includes(f.type)) {
          message += ' Vous pouvez corriger cette incohérence en forçant le traitement des colonnes comme des nombres flottants dans tous les jeux enfants.'
        }
        throw httpError(400, message)
      }
      if (f.separator !== field.separator) throw httpError(400, `Le champ "${field.key}" a des séparateurs contradictoires  (${field.separator}, ${f.separator}).`)
      let format = f.format
      if (format === 'uri-reference') format = undefined
      if (format !== field.format) throw httpError(400, `Le champ "${field.key}" a des formats contradictoires (${field.format || 'non défini'}, ${f.format || 'non défini'}).`)
      if (f['x-refersTo'] !== field['x-refersTo']) throw httpError(400, `Le champ "${field.key}" a des concepts contradictoires (${field['x-refersTo'] || 'non défini'}, ${f['x-refersTo'] || 'non défini'}).`)
      for (const key in f['x-capabilities'] || {}) {
        if (capabilitiesDefaultFalse.includes(key)) {
          if (f['x-capabilities'][key] === false || !(key in f['x-capabilities'])) field['x-capabilities'][key] = false
          if (f['x-capabilities'][key] === true && !(key in field['x-capabilities'])) field['x-capabilities'][key] = true
        } else {
          if (f['x-capabilities'][key] === false) field['x-capabilities'][key] = false
        }
      }
      for (const key in f['x-labels'] || {}) {
        if (!(key in xLabels)) xLabels[key] = f['x-labels'][key]
      }
    }
    for (const key in field['x-capabilities']) {
      if (capabilitiesDefaultFalse.includes(key) && field['x-capabilities'][key] === false) delete field['x-capabilities'][key]
    }
    if (Object.keys(xLabels).length) {
      field['x-labels'] = xLabels
    }
  }

  const fieldsByConcept: Record<string, any> = {}
  for (const f of schema) {
    if (!f || !f['x-refersTo']) continue
    if (fieldsByConcept[f['x-refersTo']]) throw httpError(400, `Le concept "${f['x-refersTo']}" est référencé par plusieurs champs (${fieldsByConcept[f['x-refersTo']]}, ${f.key}).`)
    fieldsByConcept[f['x-refersTo']] = f.key
  }

  return schema.filter((f: any) => !!f)
}

// Only non virtual descendants on which to perform the actual ES queries
export const descendants = async (dataset: VirtualDataset, tolerateStale = false, extraProperties: string[] | null = null, throwEmpty = true) => {
  const project: Record<string, 1> = {
    'descendants.id': 1,
    'descendants.isVirtual': 1,
    'descendants.virtual': 1
  }
  const options = tolerateStale ? { readPreference: 'nearest' as const } : undefined
  if (extraProperties) {
    for (const p of extraProperties) project['descendants.' + p] = 1
  }
  const res = await mongo.datasets.aggregate([{
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
  }], options).toArray()
  if (!res[0]) return []
  const virtualDescendantsWithFilters = res[0].descendants
    .filter((d: Dataset) => d.isVirtual && (d.virtual?.filters?.length || d.virtual?.filterActiveAccount))
  if (virtualDescendantsWithFilters.length) {
    throw httpError(501, 'Le jeu de données virtuel ne peut pas être requêté, il utilise un autre jeu de données virtuel avec des filtres ce qui n\'est pas supporté.')
  }
  const physicalDescendants = res[0].descendants.filter((d: Dataset) => !d.isVirtual)
  if (physicalDescendants.length === 0 && throwEmpty) {
    throw httpError(501, 'Le jeu de données virtuel ne peut pas être requêté, il n\'utilise aucun jeu de données requêtable.')
  }
  return extraProperties ? physicalDescendants : physicalDescendants.map((d: Dataset) => d.id)
}
