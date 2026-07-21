import mongo from '#mongo'
import config from '#config'
import * as datasetUtils from '../../datasets/utils/index.ts'
import capabilitiesSchema from '../../../contract/capabilities.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { AccountKeys } from '@data-fair/lib-express'
import type { Dataset, VirtualDataset } from '#types'
import { getPseudoSessionState } from '../../misc/utils/users.ts'
import { filterCan } from '../../misc/utils/permissions.ts'
import { type FindOptions } from 'mongodb'
import { type VirtualFilter, type DescendantsFilters } from '../es/operations.ts'

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
      throw httpError(400, `[noretry] Le champ "${field.key}" est interdit. Il est présent dans un jeu de données enfant mais est protégé.`)
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
        let message = `[noretry] Le champ "${field.key}" a des types contradictoires (${field.type}, ${f.type}).`
        if (['number', 'integer'].includes(field.type) && ['number', 'integer'].includes(f.type)) {
          message += ' Vous pouvez corriger cette incohérence en forçant le traitement des colonnes comme des nombres flottants dans tous les jeux enfants.'
        }
        throw httpError(400, message)
      }
      if (f.separator !== field.separator) throw httpError(400, `[noretry] Le champ "${field.key}" a des séparateurs contradictoires  (${field.separator}, ${f.separator}).`)
      let format = f.format
      if (format === 'uri-reference') format = undefined
      if (format !== field.format) throw httpError(400, `[noretry] Le champ "${field.key}" a des formats contradictoires (${field.format || 'non défini'}, ${f.format || 'non défini'}).`)
      if (f['x-refersTo'] !== field['x-refersTo']) throw httpError(400, `[noretry] Le champ "${field.key}" a des concepts contradictoires (${field['x-refersTo'] || 'non défini'}, ${f['x-refersTo'] || 'non défini'}).`)
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
    if (fieldsByConcept[f['x-refersTo']]) throw httpError(400, `[noretry] Le concept "${f['x-refersTo']}" est référencé par plusieurs champs (${fieldsByConcept[f['x-refersTo']]}, ${f.key}).`)
    fieldsByConcept[f['x-refersTo']] = f.key
  }

  return schema.filter((f: any) => !!f)
}

// "cannot be queried" errors are thrown both while serving requests (descendants are resolved
// by readDataset with fillDescendants) and inside worker tasks (finalization of a virtual dataset).
// expose sends the message as response body despite the 501 status being hidden by default,
// noRetry tells the worker loop not to retry (structured equivalent of the [noretry] message prefix)
const cannotQueryError = (message: string) => Object.assign(httpError(501, message, { expose: true }), { noRetry: true })

const recurseDescendants = async (descendants: any[], dataset: Pick<VirtualDataset, 'id' | 'owner' | 'virtual'>, mongoOptions: any, inheritedFilters: VirtualFilter[] = []) => {
  const pseudoSessionState = getPseudoSessionState(dataset.owner, 'virtual-dataset', '_virtual-dataset', 'admin')
  const permissionsFilter = filterCan(pseudoSessionState, 'datasets', 'read')
  // dedupe in case the same child is referenced twice, otherwise the count
  // comparison below would wrongly report a missing/unreadable child
  const childrenIds = [...new Set(dataset.virtual.children)]
  const children = await mongo.datasets.find({
    id: { $in: childrenIds },
    $or: permissionsFilter
  }, mongoOptions).toArray()

  if (children.length !== childrenIds.length) {
    const foundIds = new Set(children.map(c => c.id))
    const missingIds = childrenIds.filter(id => !foundIds.has(id))
    // re-query the missing children ignoring the permissions filter to tell apart
    // "the dataset does not exist anymore" from "it exists but is not readable by the
    // account owning the virtual dataset" — and report exactly which child is at fault
    const existingMissing = await mongo.datasets
      .find({ id: { $in: missingIds } }, { projection: { id: 1, title: 1, owner: 1 } })
      .toArray()
    const existingMissingById = new Map(existingMissing.map(c => [c.id, c]))
    const details = missingIds.map(id => {
      const child = existingMissingById.get(id)
      if (!child) return `le jeu de données "${id}" n'existe plus`
      const owner = child.owner
      const ownerLabel = owner.department
        ? `${owner.type === 'user' ? 'utilisateur' : 'organisation'} "${owner.name}" / département "${owner.departmentName ?? owner.department}"`
        : `${owner.type === 'user' ? 'utilisateur' : 'organisation'} "${owner.name}"`
      return `le jeu de données "${child.title ?? id}" (${id}, propriété de ${ownerLabel}) n'est pas accessible en lecture par le compte propriétaire du jeu de données virtuel`
    })
    throw cannotQueryError(`Le jeu de données virtuel "${dataset.id}" ne peut pas être requêté : ${details.join(' ; ')}.`)
  }
  for (const child of children) {
    if (child.isVirtual && child.virtual?.filterActiveAccount) {
      throw cannotQueryError(`Le jeu de données virtuel "${dataset.id}" ne peut pas être requêté : il utilise le jeu de données virtuel enfant "${child.id}" qui définit un filtre sur le compte actif, ce qui n'est pas supporté.`)
    }
    if (child.isVirtual) {
      const childFilters = (child.virtual?.filters ?? []).filter((f: any) => f.values?.length)
      await recurseDescendants(descendants, child as VirtualDataset, mongoOptions, inheritedFilters.concat(childFilters))
    } else {
      // scoped filters inherited from the virtual ancestors on this path (AND semantics);
      // the same dataset may be pushed several times with different stacks (union of paths)
      // this exact array reference is shared across every sibling stamped in this loop (and later
      // referenced from DescendantsFilters.filtered, see queryableDescendants) — safe only because
      // it is read-only from here on: the `.concat()` above always allocates a fresh array per
      // recursion level, and nothing ever mutates a stamped array in place
      if (inheritedFilters.length) (child as any)._inheritedFilters = inheritedFilters
      descendants.push(child)
    }
  }
}

// shared by descendants() and queryableDescendants(): resolves the raw physical descendant docs,
// each internally annotated with `_inheritedFilters` (see recurseDescendants) when reached through
// a filtered virtual ancestor, and applies the empty-descendants guard once
const resolveDescendants = async (dataset: Pick<VirtualDataset, 'id' | 'owner' | 'virtual'>, mongoOptions: FindOptions, throwEmpty: boolean) => {
  const descendants: any[] = []
  await recurseDescendants(descendants, dataset, mongoOptions)
  if (descendants.length === 0 && throwEmpty) {
    throw cannotQueryError('Le jeu de données virtuel ne peut pas être requêté, il n\'utilise aucun jeu de données requêtable.')
  }
  return descendants
}

// Only non virtual descendants on which to perform the actual ES queries
export const descendants = async (dataset: VirtualDataset, extraProperties: string[] | null = null, throwEmpty = true) => {
  const mongoOptions: FindOptions = {
    projection: {
      id: 1,
      isVirtual: 1,
      virtual: 1,
      owner: 1,
      permissions: 1
    }
  }
  if (extraProperties) {
    for (const p of extraProperties) mongoOptions.projection![p] = 1
  }
  const descendants = await resolveDescendants(dataset, mongoOptions, throwEmpty)
  if (extraProperties) {
    for (const descendant of descendants) {
      if (!extraProperties.includes('owner')) delete descendant.owner
      if (!extraProperties.includes('permissions')) delete descendant.permissions
      delete descendant._inheritedFilters
    }
  }
  return extraProperties ? descendants : descendants.map((d: Dataset) => d.id)
}

// descendants + the scoped-filters annotation consumed by prepareQuery/parseFilters
// (attached to the queryable dataset as `_descendantsFilters`)
// optional extraProperties mirrors descendants(): when set, also returns the full descendant
// docs (same shape/stripping rules as descendants(dataset, extraProperties)) from the SAME
// traversal, so callers that need both the raw docs (e.g. for owner-scoped file paths) and the
// filters annotation (for the ES query) don't have to resolve descendants twice.
export const queryableDescendants = async (dataset: VirtualDataset, extraProperties: string[] | null = null): Promise<{ ids: string[], filters: DescendantsFilters | null, descendantsFull?: any[] }> => {
  const mongoOptions: FindOptions = { projection: { id: 1, isVirtual: 1, virtual: 1, owner: 1, permissions: 1 } }
  if (extraProperties) {
    for (const p of extraProperties) mongoOptions.projection![p] = 1
  }
  const all = await resolveDescendants(dataset, mongoOptions, true)
  const unfilteredIds: string[] = []
  const filtered: DescendantsFilters['filtered'] = []
  for (const d of all) {
    if (d._inheritedFilters?.length) filtered.push({ id: d.id, filters: d._inheritedFilters })
    else unfilteredIds.push(d.id)
  }
  const result: { ids: string[], filters: DescendantsFilters | null, descendantsFull?: any[] } = {
    ids: all.map(d => d.id),
    filters: filtered.length ? { indicesPrefix: config.indicesPrefix, unfilteredIds, filtered } : null
  }
  if (extraProperties) {
    result.descendantsFull = all.map(d => {
      const descendant = { ...d }
      if (!extraProperties.includes('owner')) delete descendant.owner
      if (!extraProperties.includes('permissions')) delete descendant.permissions
      delete descendant._inheritedFilters
      return descendant
    })
  }
  return result
}
