// The `partOf` annotation: a generic link declaring a resource as the child of the single parent
// resource it only exists to serve. It works on weakly-typed resource refs ({ type, id, title }),
// exactly the shape it is stored with in the model, and knows nothing of the features that make a
// parent reference its children (a virtual dataset's members, an application's configuration): those
// are resolved through the parent-children utilities in shared, the only place that knows how one
// resource type references another. The single type-specific constraint partOf adds on top is
// `cannotBeChild` below.
// The datasets/applications service functions consumed by the cascades are imported dynamically:
// both services import this module, so a static import would be a cycle.
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { can } from './permissions.ts'
import { type LogContext } from './req-context.ts'
import { childTypes, parentFilters, orphanRefs, type ResourceType, type ResourceRef } from '@data-fair/data-fair-shared/resources/parent-children.ts'
import { isMasterData } from '../../../contract/master-data.js'
import type { Collection } from 'mongodb'
import type { SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'

export type { ResourceType, ResourceRef }
export type PartOf = ResourceRef & { title?: string }
export type ChildrenAction = 'delete' | 'unflag'
type Owner = { type: string, id: string, department?: string }

/** ambient request-derived context needed by the owner-change cascade */
export type PartOfContext = { sessionState: SessionStateAuthenticated, logCtx: LogContext }
/** the deletion cascades additionally need the express app (deleteDataset unindexes through it) */
export type PartOfDeletionContext = PartOfContext & { app: any }

/**
 * The only constraint partOf adds per resource type: which resources may not be subordinated to a
 * parent at all. These are rules of the annotation itself, decided on the spec — unlike everything
 * below, which applies to any resource type.
 */
const cannotBeChild: Record<ResourceType, (resource: any) => string | undefined> = {
  dataset: (dataset) => {
    // a virtual dataset aggregates other datasets, it is not a detail of a single parent
    if (dataset.isVirtual) return 'Un jeu de données virtuel ne peut pas être défini comme enfant d\'une autre ressource'
    // reference data exists to be reused across many contexts, not to serve a single parent
    if (isMasterData(dataset.masterData)) return 'Un jeu de données de référence ne peut pas être défini comme enfant d\'une autre ressource'
  },
  application: () => undefined
}

const assertCanBeChild = (childType: ResourceType, resource: any) => {
  const message = cannotBeChild[childType](resource)
  if (message) throw httpError(400, message)
}

// this module deliberately works on weakly-typed documents, both collections are queried the same way
const collection = (type: ResourceType): Collection<any> => type === 'dataset' ? mongo.datasets : mongo.applications

/** A parent and its child always live in the same account: departments are distinct permission and storage scopes. */
const isSameOwner = (a?: Owner, b?: Owner) =>
  !!a && !!b && a.type === b.type && a.id === b.id && (a.department || null) === (b.department || null)

/**
 * Children defined as `partOf` only exist to serve their parent, so an operation that stops
 * referencing them has to say what becomes of them. Narrows the childrenAction query param, or
 * refuses the request rather than silently orphaning them.
 */
const requireChildrenAction = (childrenAction: string | undefined, message: string): ChildrenAction => {
  if (childrenAction !== 'delete' && childrenAction !== 'unflag') throw httpError(409, message)
  return childrenAction
}

/**
 * Rules on a designated parent that do not depend on it referencing the child: it must not be a
 * child itself (chains would leave silent orphans behind cascading deletions) and it must live in
 * the same account (so that cascading deletions never reach another account).
 */
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

/** The children of a parent resource, whatever their type, as full documents. */
export const listChildren = async (parentType: ResourceType, parent: any): Promise<{ type: ResourceType, resource: any }[]> => {
  const children: { type: ResourceType, resource: any }[] = []
  for (const childType of childTypes(parentType, parent)) {
    const found = await collection(childType).find(childrenFilter({ type: parentType, id: parent.id })).toArray()
    children.push(...found.map(resource => ({ type: childType, resource })))
  }
  return children
}

const listChildrenRefs = async (parentType: ResourceType, parent: any): Promise<ResourceRef[]> => {
  const refs: ResourceRef[] = []
  for (const childType of childTypes(parentType, parent)) {
    const found = await collection(childType).find(childrenFilter({ type: parentType, id: parent.id }), { projection: { _id: 0, id: 1 } }).toArray()
    refs.push(...found.map(child => ({ type: childType, id: child.id })))
  }
  return refs
}

export const countChildren = async (parentType: ResourceType, parent: any): Promise<number> => {
  let count = 0
  for (const childType of childTypes(parentType, parent)) {
    count += await collection(childType).countDocuments(childrenFilter({ type: parentType, id: parent.id }))
  }
  return count
}

const deleteResource = async (ctx: PartOfDeletionContext, type: ResourceType, resource: any) => {
  if (type === 'dataset') await (await import('../../datasets/service.ts')).deleteDataset(ctx.app, resource)
  else await (await import('../../applications/service.ts')).deleteApplication(ctx, resource)
}

/**
 * Cascade applied to the children that stop being referenced by their parent, because it is deleted
 * or no longer references them: either delete them, or unflag them so they survive on their own.
 * No per-child permission check: a child exists only to serve its parent and shares its lifecycle,
 * so whoever can authorize the parent operation decides what becomes of the children.
 */
const handleChildren = async (ctx: PartOfDeletionContext, parent: ResourceRef, action: ChildrenAction, children: ResourceRef[]) => {
  for (const childType of new Set(children.map(ref => ref.type))) {
    const ids = children.filter(ref => ref.type === childType).map(ref => ref.id)
    const filter = childrenFilter(parent, ids)
    if (action === 'unflag') {
      await collection(childType).updateMany(filter, { $unset: { partOf: 1 } })
    } else {
      const resources = await collection(childType).find(filter).toArray()
      for (const resource of resources) await deleteResource(ctx, childType, resource)
    }
  }
}

/**
 * Deletion guard for a parent resource: refuses the deletion (409) while it still has children,
 * unless childrenAction says what becomes of them, then applies that cascade first.
 */
export const handleChildrenBeforeDeletion = async (ctx: PartOfDeletionContext, parentType: ResourceType, parent: any, childrenAction?: string) => {
  const children = await listChildrenRefs(parentType, parent)
  if (!children.length) return
  const action = requireChildrenAction(childrenAction, `Cette ressource a ${children.length} ressource(s) enfant(s) qui n'existent que dans ce cadre. Précisez "childrenAction=delete" pour les supprimer aussi, ou "childrenAction=unflag" pour seulement leur retirer l'attribut enfant.`)
  await handleChildren(ctx, { type: parentType, id: parent.id }, action, children)
}

export type Orphans = { action: ChildrenAction, refs: ResourceRef[] }

/**
 * Editing a parent can orphan resources still defined as its partOf children: mirror the deletion
 * guard, restricted to the children the new version no longer references. Only call it when the
 * links are actually being rewritten. Detection is separate from applyOrphans because the cascade is
 * irreversible: it must only run once the write that orphans the children has been persisted (it can
 * still be rejected).
 */
export const detectOrphans = async (parentType: ResourceType, parent: any, newParent: any, childrenAction?: string): Promise<Orphans | undefined> => {
  const refs = orphanRefs(await listChildrenRefs(parentType, parent), parentType, newParent)
  if (!refs.length) return
  const action = requireChildrenAction(childrenAction, `Cette modification retire ${refs.length} ressource(s) enfant(s) qui n'existent que dans ce cadre. Précisez "childrenAction=delete" pour les supprimer aussi, ou "childrenAction=unflag" pour seulement leur retirer l'attribut enfant.`)
  return { action, refs }
}

export const applyOrphans = async (ctx: PartOfDeletionContext, parentType: ResourceType, parentId: string, orphans?: Orphans) => {
  if (!orphans) return
  await handleChildren(ctx, { type: parentType, id: parentId }, orphans.action, orphans.refs)
}

/**
 * Definition-time rules, when a patch defines an existing resource as a child: the resource must be
 * allowed to be a child and have no children of its own; it must be referenced by exactly one parent
 * resource — 0 or 2+ makes the relationship ambiguous — which must be the one designated by the
 * patch, and an eligible parent. Denormalizes the parent's current title on the partOf, never
 * trusting the one sent by the client. `resource` is the effective view: the stored document with
 * the patch applied.
 */
export const prepareAtDefinition = async (childType: ResourceType, resource: any, partOf: PartOf) => {
  if (partOf.type === childType && partOf.id === resource.id) throw httpError(400, 'Une ressource ne peut pas être définie comme son propre enfant')
  assertCanBeChild(childType, resource)
  // a resource that has partOf children of its own cannot itself become a child: chains would leave
  // silent orphans behind cascading deletions
  if (await countChildren(childType, resource) > 0) throw httpError(400, 'Une ressource qui a des ressources enfants ne peut pas être elle-même définie comme enfant, les chaînages ne sont pas autorisés')
  const parents = await findReferencingParents({ type: childType, id: resource.id })
  if (parents.length !== 1) throw httpError(400, `Cette ressource ne peut être définie comme enfant que si elle est utilisée par une seule ressource parente ; elle en compte actuellement ${parents.length}.`)
  const parent = parents[0]
  if (parent.type !== partOf.type || parent.id !== partOf.id) throw httpError(400, 'La ressource parente indiquée ne correspond pas à l\'unique ressource qui utilise celle-ci.')
  assertEligibleParent(parent, resource.owner)
  // the parent's title is denormalized on the child, always trust the current value, not the one sent by the client
  partOf.title = parent.title
}

/**
 * The write operation on the parent that would make it reference the child. Creating a child under
 * a parent and making that parent point at it are the same right: whoever can do one can do the other.
 */
const canReferenceChild = (parent: any, parentType: ResourceType, sessionState: SessionState) =>
  parentType === 'dataset'
    // a member is added to a virtual dataset by patching `virtual`, one of the breaking keys
    ? can('datasets', parent, 'writeDescriptionBreaking', sessionState)
    // an application's configuration is written by two routes, gated by two different operations;
    // the disjunction is deliberate — do not tighten it to writeConfig, that would 403 integrators
    // who reference children through the writeDescription-gated PATCH route
    : can('applications', parent, 'writeConfig', sessionState) ||
      can('applications', parent, 'writeDescription', sessionState)

/**
 * Creation-time gate, used when a child is created directly under its parent. The parent cannot
 * reference the child yet, so the definition-time "used by exactly one parent resource" rule is
 * replaced by a permission check on the parent. It is a write-class check, not the admin-class
 * writePartOf that guards the danger zone: subordinating a resource that already stands on its own
 * is an admin act on that resource, creating one that never stood on its own is not. Whoever holds
 * this right can also unflag the child afterwards, by dropping it from the parent's members.
 */
export const prepareAtCreation = async (childType: ResourceType, resource: any, sessionState: SessionState) => {
  assertCanBeChild(childType, resource)
  const partOf: PartOf = resource.partOf
  // read whole: which fields tell a parent apart is the link table's business, not this module's
  const parent = await collection(partOf.type).findOne({ id: partOf.id })
  if (!parent) throw httpError(400, 'La ressource parente indiquée n\'existe pas')
  assertEligibleParent(parent, resource.owner)
  // the parent cannot reference the child yet, but it must at least be able to
  if (!childTypes(partOf.type, parent).includes(childType)) {
    throw httpError(400, 'La ressource parente indiquée ne peut pas référencer une ressource enfant de ce type')
  }
  if (!canReferenceChild(parent, partOf.type, sessionState)) {
    throw httpError(403, 'Vous n\'avez pas la permission de modifier cette ressource parente pour qu\'elle référence une ressource enfant')
  }
  // the parent's title is denormalized on the child, always trust the current value, not the one sent by the client
  partOf.title = parent.title
}

/**
 * A child only exists to serve its parent, and both always live in the same account: it can only
 * follow its parent, never change accounts on its own.
 */
export const assertOwnerChangeAllowed = (resource: any) => {
  if (resource.partOf) throw httpError(409, 'Cette ressource est définie comme enfant d\'une autre ressource, elle ne peut pas changer de compte indépendamment de celle-ci.')
}

/**
 * A parent takes its children along when it changes accounts. Chains being forbidden, the children
 * of a child do not exist and the recursion through changeApplicationOwner terminates immediately.
 * Returns the number of moved datasets so the caller can refresh the accounts' storage totals.
 */
export const changeChildrenOwner = async (ctx: PartOfContext, parentType: ResourceType, parent: any, newOwner: any): Promise<{ movedDatasets: number }> => {
  let movedDatasets = 0
  for (const child of await listChildren(parentType, parent)) {
    if (child.type === 'dataset') {
      const patched = await (await import('../../datasets/service.ts')).changeDatasetOwner(child.resource, newOwner, ctx.sessionState)
      // a child cannot be reference data, the sync only cleans up a possible stale remote service
      await (await import('../../remote-services/service.ts')).syncDataset(patched)
      movedDatasets++
    } else {
      await (await import('../../applications/service.ts')).changeApplicationOwner(ctx, child.resource, newOwner)
    }
  }
  return { movedDatasets }
}

/**
 * Children are hidden from resource listings by default: ?partOf=true reveals only children,
 * ?partOf=<parentId> the children of that specific parent. The caller exempts its targeted-fetch
 * params (lookups by known id/slug, reverse-lookups such as "which parents reference me") — those
 * are not browsing and must keep working even when the resource happens to be someone's child.
 */
export const listFilter = (reqQuery: Record<string, any>, exemptedParams: string[]): Record<string, any> | undefined => {
  if (reqQuery.partOf === 'true') return { 'partOf.id': { $exists: true } }
  if (reqQuery.partOf) return { 'partOf.id': reqQuery.partOf }
  if (exemptedParams.some(param => reqQuery[param])) return undefined
  return { 'partOf.id': { $exists: false } }
}
