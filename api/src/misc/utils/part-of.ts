// The partOf annotation: a resource is the child of the single parent it only exists to serve.
// How a parent references its children is the business of shared/utils/parent-children.ts.
// The datasets/applications services are imported dynamically, both import this module.
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { can } from './permissions.ts'
import { type LogContext } from './req-context.ts'
import { resourceTypes, childRefs, parentFilters, orphanRefs, sameRef, type ResourceType, type ResourceRef } from '@data-fair/data-fair-shared/utils/parent-children.ts'
import { isMasterData } from '../../../contract/master-data.js'
import type { Collection, Document } from 'mongodb'
import type { SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'

export type { ResourceType, ResourceRef }
export type PartOf = ResourceRef & { title?: string }
export type ChildrenAction = 'delete' | 'unflag'
export type Orphans = { action: ChildrenAction, refs: ResourceRef[] }
type Owner = { type: string, id: string, department?: string }

export type PartOfContext = { sessionState: SessionStateAuthenticated, logCtx: LogContext }

// reference data exists to be reused across many contexts, not to serve a single parent
const cannotBeChild: Record<ResourceType, (resource: any) => string | undefined> = {
  dataset: (dataset) => {
    if (isMasterData(dataset.masterData)) return 'Un jeu de données de référence ne peut pas être défini comme enfant d\'une autre ressource'
  },
  application: () => undefined
}

const assertCanBeChild = (childType: ResourceType, resource: any) => {
  const message = cannotBeChild[childType](resource)
  if (message) throw httpError(400, message)
}

const collection = (type: ResourceType): Collection<any> => type === 'dataset' ? mongo.datasets : mongo.applications

// a department is a distinct permission and storage scope
const isSameOwner = (a?: Owner, b?: Owner) =>
  !!a && !!b && a.type === b.type && a.id === b.id && (a.department || null) === (b.department || null)

const requireChildrenAction = (childrenAction: string | undefined, message: string): ChildrenAction => {
  if (childrenAction !== 'delete' && childrenAction !== 'unflag') throw httpError(409, message)
  return childrenAction
}

// chains would leave silent orphans behind a cascading deletion, and a cascade must never reach another account
const assertEligibleParent = (parent: any, childOwner: Owner) => {
  if (parent.partOf) throw httpError(400, 'La ressource parente est elle-même définie comme enfant d\'une autre ressource, les chaînages ne sont pas autorisés')
  if (!isSameOwner(parent.owner, childOwner)) throw httpError(400, 'La ressource parente doit appartenir au même compte que la ressource enfant')
}

/** The resources referencing the given one, i.e. its potential parents. */
const findReferencingParents = async (child: ResourceRef) => {
  const parents: ({ type: ResourceType } & Record<string, any>)[] = []
  for (const { type, filter } of parentFilters(child)) {
    const found = await collection(type).find(filter, { projection: { _id: 0, id: 1, title: 1, owner: 1, partOf: 1 } }).toArray()
    parents.push(...found.map(parent => ({ ...parent, type })))
  }
  return parents
}

const childrenFilter = (parent: ResourceRef, onlyIds?: string[]) =>
  ({ 'partOf.type': parent.type, 'partOf.id': parent.id, ...(onlyIds ? { id: { $in: onlyIds } } : {}) })

/** The children of a parent resource, whatever their type. */
export const listChildren = async (parentType: ResourceType, parentId: string, projection?: Document): Promise<{ type: ResourceType, resource: any }[]> => {
  const children: { type: ResourceType, resource: any }[] = []
  for (const childType of resourceTypes) {
    const found = await collection(childType).find(childrenFilter({ type: parentType, id: parentId }), { projection }).toArray()
    children.push(...found.map(resource => ({ type: childType, resource })))
  }
  return children
}

const listChildrenRefs = async (parentType: ResourceType, parentId: string): Promise<ResourceRef[]> =>
  (await listChildren(parentType, parentId, { _id: 0, id: 1 })).map(child => ({ type: child.type, id: child.resource.id }))

const deleteResource = async (ctx: PartOfContext, type: ResourceType, resource: any) => {
  if (type === 'dataset') await (await import('../../datasets/service.ts')).deleteDataset(resource)
  else await (await import('../../applications/service.ts')).deleteApplication(ctx, resource)
}

/**
 * Children that stop being referenced by their parent: either delete them, or unflag them so they
 * survive on their own. No per-child permission check, whoever can act on the parent decides.
 * The parent may already be deleted when this runs (see detectOrphans / applyOrphans).
 */
const handleChildren = async (ctx: PartOfContext, parent: ResourceRef, action: ChildrenAction, children: ResourceRef[]) => {
  for (const childType of new Set(children.map(ref => ref.type))) {
    const ids = children.filter(ref => ref.type === childType).map(ref => ref.id)
    const filter = childrenFilter(parent, ids)
    if (action === 'unflag') {
      const [child] = await collection(childType).find(filter, { projection: { owner: 1 } }).limit(1).toArray()
      await collection(childType).updateMany(filter, { $unset: { partOf: 1 } })
      // unflagged datasets count again in the number of datasets
      if (childType === 'dataset' && child) await (await import('../../datasets/utils/storage.ts')).updateTotalStorage(child.owner)
    } else {
      const resources = await collection(childType).find(filter).toArray()
      for (const resource of resources) await deleteResource(ctx, childType, resource)
    }
  }
}

/**
 * Refuses (409) a parent write that would orphan its partOf children unless childrenAction says what
 * becomes of them. `newParent` is the version about to be written, undefined when the parent is
 * deleted. The cascade itself is applied by applyOrphans once the write is persisted, it is irreversible.
 */
export const detectOrphans = async (parentType: ResourceType, parent: any, newParent: any | undefined, childrenAction?: string): Promise<Orphans | undefined> => {
  const children = await listChildrenRefs(parentType, parent.id)
  const refs = newParent ? orphanRefs(children, parentType, newParent) : children
  if (!refs.length) return
  const message = newParent
    ? `Cette modification retire ${refs.length} ressource(s) enfant(s) qui n'existent que dans ce cadre.`
    : `Cette ressource a ${refs.length} ressource(s) enfant(s) qui n'existent que dans ce cadre.`
  const action = requireChildrenAction(childrenAction, `${message} Précisez "childrenAction=delete" pour les supprimer aussi, ou "childrenAction=unflag" pour seulement leur retirer l'attribut enfant.`)
  return { action, refs }
}

export const applyOrphans = async (ctx: PartOfContext, parentType: ResourceType, parentId: string, orphans?: Orphans) => {
  if (!orphans) return
  await handleChildren(ctx, { type: parentType, id: parentId }, orphans.action, orphans.refs)
}

/**
 * The single-parent invariant after definition time: a parent may not start referencing a resource
 * already defined as the child of another one. Only the refs added by `newParent` over the stored
 * `parent` ({} at creation) are checked, so a legacy state never blocks an unrelated edit.
 */
export const assertNoForeignChildren = async (parentType: ResourceType, parent: any, newParent: any) => {
  const known = childRefs(parentType, parent)
  const added = childRefs(parentType, newParent).filter(ref => !known.some(k => sameRef(k, ref)))
  for (const childType of resourceTypes) {
    const ids = added.filter(ref => ref.type === childType).map(ref => ref.id)
    if (!ids.length) continue
    // the mongo client ignores undefined values: never send a $nor on a missing parent id
    const ownChildren = parent.id ? { $nor: [{ 'partOf.type': parentType, 'partOf.id': parent.id }] } : {}
    const foreign = await collection(childType).findOne(
      { id: { $in: ids }, 'partOf.id': { $exists: true }, ...ownChildren },
      { projection: { _id: 0, id: 1, title: 1, partOf: 1 } }
    )
    if (foreign) throw httpError(400, `La ressource "${foreign.title ?? foreign.id}" (${foreign.id}) est définie comme enfant de "${foreign.partOf.title ?? foreign.partOf.id}" : elle ne peut pas être utilisée par une autre ressource.`)
  }
}

/**
 * Definition-time rules, when a patch defines an existing resource as a child. `resource` is the
 * effective view (stored document + patch). Denormalizes the parent's current title on the partOf.
 */
export const prepareAtDefinition = async (childType: ResourceType, resource: any, partOf: PartOf) => {
  if (partOf.type === childType && partOf.id === resource.id) throw httpError(400, 'Une ressource ne peut pas être définie comme son propre enfant')
  assertCanBeChild(childType, resource)
  if ((await listChildrenRefs(childType, resource.id)).length) throw httpError(400, 'Une ressource qui a des ressources enfants ne peut pas être elle-même définie comme enfant, les chaînages ne sont pas autorisés')
  const parents = await findReferencingParents({ type: childType, id: resource.id })
  if (parents.length !== 1) throw httpError(400, `Cette ressource ne peut être définie comme enfant que si elle est utilisée par une seule ressource parente ; elle en compte actuellement ${parents.length}.`)
  const parent = parents[0]
  if (parent.type !== partOf.type || parent.id !== partOf.id) throw httpError(400, 'La ressource parente indiquée ne correspond pas à l\'unique ressource qui utilise celle-ci.')
  assertEligibleParent(parent, resource.owner)
  partOf.title = parent.title
}

// the write on the parent that would make it reference the child: writing `virtual` on a dataset,
// the configuration on an application (two routes, two operations, the disjunction is deliberate)
const canReferenceChild = (parent: any, parentType: ResourceType, sessionState: SessionState) =>
  parentType === 'dataset'
    ? can('datasets', parent, 'writeDescriptionBreaking', sessionState)
    : can('applications', parent, 'writeConfig', sessionState) || can('applications', parent, 'writeDescription', sessionState)

/**
 * Creation-time rules, when a child is created directly under its parent. The parent cannot
 * reference it yet, so the "used by exactly one parent" rule is replaced by a write-class permission
 * check on the parent (not the admin-class writePartOf: the child never stood on its own).
 */
export const prepareAtCreation = async (childType: ResourceType, resource: any, sessionState: SessionState) => {
  assertCanBeChild(childType, resource)
  const partOf: PartOf = resource.partOf
  const parent = await collection(partOf.type).findOne({ id: partOf.id })
  if (!parent) throw httpError(400, 'La ressource parente indiquée n\'existe pas')
  assertEligibleParent(parent, resource.owner)
  if (!canReferenceChild(parent, partOf.type, sessionState)) {
    throw httpError(403, 'Vous n\'avez pas la permission de modifier cette ressource parente pour qu\'elle référence une ressource enfant')
  }
  partOf.title = parent.title
}

/** A child is deleted with its parent, never on its own. Only the delete routes call this, the cascades go through the services. */
export const assertNotChild = (resource: any) => {
  if (!resource.partOf) return
  throw httpError(409, `Cette ressource est définie comme enfant de "${resource.partOf.title ?? resource.partOf.id}" : elle se gère et se supprime depuis sa ressource parente.`)
}

/** A child can only follow its parent into another account. */
export const assertOwnerChangeAllowed = (resource: any) => {
  if (resource.partOf) throw httpError(409, 'Cette ressource est définie comme enfant d\'une autre ressource, elle ne peut pas changer de compte indépendamment de celle-ci.')
}

/** A parent takes its children along when it changes accounts (chains are forbidden, the recursion ends at depth one). */
export const changeChildrenOwner = async (ctx: PartOfContext, parentType: ResourceType, parentId: string, newOwner: any) => {
  for (const child of await listChildren(parentType, parentId)) {
    if (child.type === 'dataset') {
      const patched = await (await import('../../datasets/service.ts')).changeDatasetOwner(ctx, child.resource, newOwner)
      await (await import('../../remote-services/service.ts')).syncDataset(patched)
    } else {
      await (await import('../../applications/service.ts')).changeApplicationOwner(ctx, child.resource, newOwner)
    }
  }
}

/** The parent's title is denormalized on its children, keep it current when the parent is renamed. */
export const syncChildrenTitle = async (parentType: ResourceType, parentId: string, title: string) => {
  for (const childType of resourceTypes) {
    await collection(childType).updateMany(childrenFilter({ type: parentType, id: parentId }), { $set: { 'partOf.title': title } })
  }
}

/**
 * Children are hidden from listings by default: ?partOf=true reveals only children, ?partOf=<parentId>
 * the children of that parent. Targeted fetches (the caller's exempted params) are never filtered.
 */
export const listFilter = (reqQuery: Record<string, any>, exemptedParams: string[]): Record<string, any> | undefined => {
  if (reqQuery.partOf === 'true') return { 'partOf.id': { $exists: true } }
  if (reqQuery.partOf && reqQuery.partOf !== 'false') return { 'partOf.id': reqQuery.partOf }
  if (exemptedParams.some(param => reqQuery[param])) return undefined
  return { 'partOf.id': { $exists: false } }
}
