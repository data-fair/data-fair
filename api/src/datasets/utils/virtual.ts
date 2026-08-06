import mongo from '#mongo'
import config from '#config'
import * as datasetUtils from '../../datasets/utils/index.ts'
import capabilitiesSchema from '../../../contract/capabilities.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Account } from '@data-fair/lib-express'
import type { VirtualDataset } from '#types'
import { getPseudoSessionState } from '../../misc/utils/users.ts'
import { filterCan } from '../../misc/utils/permissions.ts'
import { type FindOptions } from 'mongodb'
import { type VirtualFilter, type QueryableDescendant } from '../es/operations.ts'

// distinguish "the dataset does not exist anymore" from "it exists but is not readable by the
// account owning the virtual dataset" — and report exactly which child is at fault
const missingChildrenDetails = async (missingIds: string[]) => {
  const existingMissing = await mongo.datasets
    .find({ id: { $in: missingIds } }, { projection: { id: 1, title: 1, owner: 1 } })
    .toArray()
  const existingMissingById = new Map(existingMissing.map(c => [c.id, c]))
  return missingIds.map(id => {
    const child = existingMissingById.get(id)
    if (!child) return `le jeu de données "${id}" n'existe plus`
    const owner = child.owner
    const ownerLabel = owner.department
      ? `${owner.type === 'user' ? 'utilisateur' : 'organisation'} "${owner.name}" / département "${owner.departmentName ?? owner.department}"`
      : `${owner.type === 'user' ? 'utilisateur' : 'organisation'} "${owner.name}"`
    return `le jeu de données "${child.title ?? id}" (${id}, propriété de ${ownerLabel}) n'est pas accessible en lecture par le compte propriétaire du jeu de données virtuel`
  })
}

// blacklisted fields are fields that are present in a grandchild but not re-exposed
// by the child.. it must not be possible to access those fields in the case
// of another child having the same key
async function childrenSchemas (owner: Account, children: string[], blackListedFields: Set<string>) {
  const schemas: any[] = []
  // the children usable by a virtual dataset are those its owner account can read — the same
  // permissions model applied when resolving the descendants of a query (see recurseDescendants)
  const pseudoSessionState = getPseudoSessionState(owner, 'virtual-dataset', '_virtual-dataset', 'admin')
  const permissionsFilter = filterCan(pseudoSessionState, 'datasets', 'read')
  for (const childId of [...new Set(children)]) {
    const child = await mongo.datasets.findOne(
      { id: childId, $or: permissionsFilter },
      { projection: { isVirtual: 1, virtual: 1, schema: 1, owner: 1 } })
    if (!child) {
      // fail fast at creation / patch / finalization time with the same detailed report the
      // query path produces, instead of silently preparing an unreconciled schema
      const details = await missingChildrenDetails([childId])
      throw httpError(400, `[noretry] Le schéma du jeu de données virtuel ne peut pas être établi : ${details.join(' ; ')}.`)
    }
    if (child.isVirtual && child.virtual) {
      // recurse only to blacklist protected fields at every level — readability is judged level
      // by level from the owner of each intermediate virtual dataset, like at query time (an
      // intermediate virtual dataset can expose a child its own owner can read to accounts that
      // cannot read that child directly). The returned schemas are not merged into the result:
      // a virtual child's schema is already reconciled with its own children (level by level,
      // kept in sync by re-finalization when a descendant changes), so only direct children
      // participate in the compatibility checks of prepareVirtualDataset
      const grandChildrenSchemas = await childrenSchemas(child.owner, child.virtual.children, blackListedFields)
      for (const s of grandChildrenSchemas) {
        for (const field of s) {
          if (!child.schema?.find(f => f.key === field.key)) blackListedFields.add(field.key)
        }
      }
    }
    schemas.push(child.schema)
  }
  return schemas
}

// Validate and fill a virtual dataset schema based on its children
// @ts-ignore
const capabilitiesDefaultFalse = Object.keys(capabilitiesSchema.properties).filter((key: string) => capabilitiesSchema.properties[key]?.default === false)

// Compute the derived state of a virtual dataset from its children: the reconciled schema and the
// attachmentsAsImage flag (the thumbnail routines require the flag and the image concept of
// _attachment_url to be in lockstep). Reads the children from mongo but never mutates its input:
// it works on a deep copy of the dataset schema.
const prepareVirtualDataset = async (dataset: VirtualDataset): Promise<{ schema: any[], attachmentsAsImage: boolean }> => {
  if (!dataset.virtual.children || !dataset.virtual.children.length) return { schema: [], attachmentsAsImage: false }
  // extendedSchema (cleanSchema, fixConcepts) and the reconciliation below mutate the dataset
  // and its field objects in place
  dataset = { ...dataset, schema: structuredClone(dataset.schema ?? []) }
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
    // timeZone drives the day boundaries of date filters and aggregations, which are applied to
    // the children indices: it must reflect the children data, not the default timezone
    if (matchingFields[0].timeZone) field.timeZone = matchingFields[0].timeZone
    else delete field.timeZone

    // Some attributes of a field have to be homogeneous accross all children.
    // Capability keys absent from the contract are generator-owned, not user config (e.g.
    // nativeWildcard stamped on _attachment_url by extendedSchema to reflect its ES wildcard
    // mapping): they describe the children indices too, preserve them through the merge below
    const ownCapabilities: Record<string, any> = field['x-capabilities'] || {}
    field['x-capabilities'] = {}
    for (const key in ownCapabilities) {
      // @ts-ignore
      if (!capabilitiesSchema.properties[key]) field['x-capabilities'][key] = ownCapabilities[key]
    }
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
      if (f['x-refersTo'] !== field['x-refersTo']) {
        if (field.key === '_attachment_url') {
          // children disagree on attachmentsAsImage: degrade to plain attachment links (no image
          // concept, so no derived attachmentsAsImage flag either) instead of failing on a
          // calculated field the user cannot edit directly
          delete field['x-refersTo']
          delete field['x-concept']
        } else {
          throw httpError(400, `[noretry] Le champ "${field.key}" a des concepts contradictoires (${field['x-refersTo'] || 'non défini'}, ${f['x-refersTo'] || 'non défini'}).`)
        }
      }
      // default-TRUE capabilities: any child disabling one disables it on the parent
      for (const key in f['x-capabilities'] || {}) {
        if (capabilitiesDefaultFalse.includes(key)) continue
        if (f['x-capabilities'][key] === false) field['x-capabilities'][key] = false
      }
      for (const key in f['x-labels'] || {}) {
        if (!(key in xLabels)) xLabels[key] = f['x-labels'][key]
      }
    }
    // default-FALSE capabilities: true on the parent only when EVERY child declares it true. Each
    // maps to an inner ES field absent from the children that never opted in, and querying an
    // unmapped field across a virtual dataset's indices returns nothing rather than failing. The
    // veto must therefore cover children that OMIT the key, not just those that set it false.
    for (const key of capabilitiesDefaultFalse) {
      if (matchingFields.every((f: any) => f['x-capabilities']?.[key] === true)) field['x-capabilities'][key] = true
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

  const attachmentUrlField = schema.find((f: any) => f?.key === '_attachment_url')
  return {
    schema: schema.filter((f: any) => !!f),
    attachmentsAsImage: attachmentUrlField?.['x-refersTo'] === 'http://schema.org/image'
  }
}

// The single persistence contract for the derived state of a virtual dataset: the reconciled
// schema, plus the attachmentsAsImage flag only when it must change on the stored document
// (true to set it, null to unset it — the patch appliers translate null to $unset). Used by
// every write path: creation, finalization, metadata patch, and the sync performed when a child
// schema changes without a worker run.
export const prepareVirtualDatasetPatch = async (dataset: VirtualDataset): Promise<{ schema: any[], attachmentsAsImage?: true | null }> => {
  const { schema, attachmentsAsImage } = await prepareVirtualDataset(dataset)
  const patch: { schema: any[], attachmentsAsImage?: true | null } = { schema }
  if (attachmentsAsImage && !dataset.attachmentsAsImage) patch.attachmentsAsImage = true
  if (!attachmentsAsImage && dataset.attachmentsAsImage) patch.attachmentsAsImage = null
  return patch
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
    const details = await missingChildrenDetails(childrenIds.filter(id => !foundIds.has(id)))
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
      // referenced from QueryableDescendant.filters, see descendants()) — safe only because
      // it is read-only from here on: the `.concat()` above always allocates a fresh array per
      // recursion level, and nothing ever mutates a stamped array in place
      if (inheritedFilters.length) (child as any)._inheritedFilters = inheritedFilters
      descendants.push(child)
    }
  }
}

// resolves the raw physical descendant docs, each internally annotated with `_inheritedFilters`
// (see recurseDescendants) when reached through a filtered virtual ancestor, and applies the
// empty-descendants guard
const resolveDescendants = async (dataset: Pick<VirtualDataset, 'id' | 'owner' | 'virtual'>, mongoOptions: FindOptions, throwEmpty: boolean) => {
  const descendants: any[] = []
  await recurseDescendants(descendants, dataset, mongoOptions)
  if (descendants.length === 0 && throwEmpty) {
    throw cannotQueryError('Le jeu de données virtuel ne peut pas être requêté, il n\'utilise aucun jeu de données requêtable.')
  }
  return descendants
}

// an element of the traversal result: always the queryable fields (id / index / optional scoped
// filters), plus the requested extraProperties read from the descendant's mongo doc
export type Descendant = QueryableDescendant & Record<string, any>

// The single traversal of a virtual dataset: the non virtual descendants on which the actual ES
// queries are performed. The result is THE source of truth assigned to `dataset.descendants` — it
// carries both the multi-index target (`index`, resolved here so that es/operations.ts and
// api-compat/ods/operations.ts stay config-free) and the scoped filters inherited from
// intermediate virtual children, so no caller can resolve one without the other.
// The array is arrival-based: a descendant reachable through both a filtered and an unfiltered
// path appears twice, which is what gives correct union-of-paths semantics — never deduplicate it.
// `extraProperties` adds fields of the descendant's mongo doc to each element.
// `throwEmpty` false is for callers (e.g. storage computation) that tolerate a non queryable
// virtual dataset.
export const descendants = async (dataset: VirtualDataset, extraProperties: string[] | null = null, throwEmpty = true): Promise<Descendant[]> => {
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
  const docs = await resolveDescendants(dataset, mongoOptions, throwEmpty)
  return docs.map((doc: any) => {
    const descendant: Descendant = { ...doc, index: `${config.indicesPrefix}-${doc.id}` }
    if (doc._inheritedFilters?.length) descendant.filters = doc._inheritedFilters
    delete descendant._inheritedFilters
    // isVirtual/virtual are only fetched to drive the recursion, and owner/permissions to check
    // readability — none of them is part of the result unless explicitly requested
    delete descendant.isVirtual
    delete descendant.virtual
    if (!extraProperties?.includes('owner')) delete descendant.owner
    if (!extraProperties?.includes('permissions')) delete descendant.permissions
    return descendant
  })
}
