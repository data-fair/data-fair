// Central home for the `partOf` concept: a resource declared as the child of the single parent
// resource it only exists to serve (a dataset aggregated by a virtual dataset, a dataset or an
// application embedded in an application). Everything here works on weakly-typed resource refs
// ({ type, id, title }), exactly the shape `partOf` is stored with in the model. The per-type
// variations are declared once in the two rules tables below — mainly the way a parent lists the
// child resources it references (a virtual dataset reads `virtual.children`, an application reads
// its configuration) — everything else is generic over the refs.
// The datasets/applications service functions consumed by the cascades are imported dynamically:
// both services import this module, so a static import would be a cycle.
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { can } from './permissions.ts'
import { type LogContext } from './req-context.ts'
import { configRefIds } from '@data-fair/data-fair-shared/application/config-refs.ts'
import { isMasterData } from '../../../contract/master-data.js'
import type { Collection } from 'mongodb'
import type { SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'

export type ResourceType = 'dataset' | 'application'
export type ResourceRef = { type: ResourceType, id: string }
export type PartOf = ResourceRef & { title?: string }
export type ChildrenAction = 'delete' | 'unflag'
type Owner = { type: string, id: string, department?: string }

/** ambient request-derived context needed by the owner-change cascade */
export type PartOfContext = { sessionState: SessionStateAuthenticated, logCtx: LogContext }
/** the deletion cascades additionally need the express app (deleteDataset unindexes through it) */
export type PartOfDeletionContext = PartOfContext & { app: any }

// this module deliberately works on weakly-typed documents, both collections are queried the same way
const collection = (type: ResourceType): Collection<any> => type === 'dataset' ? mongo.datasets : mongo.applications

/**
 * The parent side of the relationship: everything that varies from one resource type to the other
 * lives here, the rest of the module is generic. `container` is the part of the parent document
 * that references its members: the `virtual` sub-document of a virtual dataset, the configuration
 * of an application.
 */
const parentRules: Record<ResourceType, {
  /** the types of children a parent of this type can reference */
  childTypes: ResourceType[]
  /** whether this resource can reference children at all — lets the guards skip queries entirely */
  canBeParent: (parent: any) => boolean
  cannotBeParentMessage: string
  /** mongo filter matching the parents of this type whose container references the given resource */
  referencesChildFilter: (child: ResourceRef) => Record<string, any>
  /** refs of the children referenced by the given container */
  referencedChildRefs: (container: any) => ResourceRef[]
}> = {
  dataset: {
    childTypes: ['dataset'],
    // only a virtual dataset aggregates other datasets, a file/rest/metaOnly one can never be a parent
    canBeParent: (parent) => !!parent.isVirtual,
    cannotBeParentMessage: 'Seul un jeu de données virtuel peut être la ressource parente d\'un jeu de données',
    referencesChildFilter: (child) => ({ 'virtual.children': child.id }),
    referencedChildRefs: (virtual) => ((virtual?.children ?? []) as string[]).map(id => ({ type: 'dataset', id }))
  },
  application: {
    childTypes: ['dataset', 'application'],
    canBeParent: () => true,
    cannotBeParentMessage: 'Cette ressource ne peut pas être une ressource parente',
    referencesChildFilter: (child) => child.type === 'dataset'
      ? { 'configuration.datasets.id': child.id }
      : { 'configuration.applications.id': child.id },
    referencedChildRefs: (configuration) => [
      ...configRefIds(configuration?.datasets).map(id => ({ type: 'dataset' as const, id })),
      ...configRefIds(configuration?.applications).map(id => ({ type: 'application' as const, id }))
    ]
  }
}

/**
 * The child side: rules that make a resource ineligible to ever be someone's child, applied both
 * at creation time and at definition time (then on the effective, patched view of the resource).
 */
const childEligibilityRules: Record<ResourceType, (resource: any) => void> = {
  dataset: (resource) => {
    // a virtual dataset can never be a child, which also prevents chains on the datasets side
    // (only a virtual dataset can be the parent of datasets)
    if (resource.isVirtual) throw httpError(400, 'Un jeu de données virtuel ne peut pas être défini comme enfant d\'une autre ressource')
    // a reference dataset exists to be reused across many contexts, not to serve a single parent
    if (isMasterData(resource.masterData)) throw httpError(400, 'Un jeu de données de référence ne peut pas être défini comme enfant d\'une autre ressource')
  },
  application: () => {}
}

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
 * Rules on a designated parent that do not depend on the references between the two resources:
 * it must not be a child itself (chains would leave silent orphans behind cascading deletions),
 * it must live in the same account (so that cascading deletions never reach another account),
 * and its type-specific rules must allow it to be a parent at all.
 */
const assertEligibleParent = (parent: { type: ResourceType } & Record<string, any>, childOwner: Owner) => {
  if (parent.partOf) throw httpError(400, 'La ressource parente est elle-même définie comme enfant d\'une autre ressource, les chaînages ne sont pas autorisés')
  if (!isSameOwner(parent.owner, childOwner)) throw httpError(400, 'La ressource parente doit appartenir au même compte que la ressource enfant')
  if (!parentRules[parent.type].canBeParent(parent)) throw httpError(400, parentRules[parent.type].cannotBeParentMessage)
}

/** The resources whose container references the given resource, i.e. its potential parents. */
const findReferencingParents = async (child: ResourceRef) => {
  const parents: ({ type: ResourceType } & Record<string, any>)[] = []
  for (const parentType of Object.keys(parentRules) as ResourceType[]) {
    const rules = parentRules[parentType]
    if (!rules.childTypes.includes(child.type)) continue
    const found = await collection(parentType)
      .find(rules.referencesChildFilter(child), { projection: { _id: 0, id: 1, title: 1, owner: 1, partOf: 1, isVirtual: 1 } })
      .toArray()
    parents.push(...found.map(parent => ({ type: parentType, ...parent })))
  }
  return parents
}

const childrenFilter = (parent: ResourceRef, onlyIds?: string[]) =>
  ({ 'partOf.type': parent.type, 'partOf.id': parent.id, ...(onlyIds ? { id: { $in: onlyIds } } : {}) })

/** The children of a parent resource, whatever their type, as full documents. */
export const listChildren = async (parentType: ResourceType, parent: any): Promise<{ type: ResourceType, resource: any }[]> => {
  const rules = parentRules[parentType]
  if (!rules.canBeParent(parent)) return []
  const children: { type: ResourceType, resource: any }[] = []
  for (const childType of rules.childTypes) {
    const found = await collection(childType).find(childrenFilter({ type: parentType, id: parent.id })).toArray()
    children.push(...found.map(resource => ({ type: childType, resource })))
  }
  return children
}

const listChildrenRefs = async (parentType: ResourceType, parent: any): Promise<ResourceRef[]> => {
  const rules = parentRules[parentType]
  if (!rules.canBeParent(parent)) return []
  const refs: ResourceRef[] = []
  for (const childType of rules.childTypes) {
    const found = await collection(childType).find(childrenFilter({ type: parentType, id: parent.id }), { projection: { _id: 0, id: 1 } }).toArray()
    refs.push(...found.map(child => ({ type: childType, id: child.id })))
  }
  return refs
}

export const countChildren = async (parentType: ResourceType, parent: any): Promise<number> => {
  const rules = parentRules[parentType]
  if (!rules.canBeParent(parent)) return 0
  let count = 0
  for (const childType of rules.childTypes) {
    count += await collection(childType).countDocuments(childrenFilter({ type: parentType, id: parent.id }))
  }
  return count
}

const deleteResource = async (ctx: PartOfDeletionContext, type: ResourceType, resource: any) => {
  if (type === 'dataset') await (await import('../../datasets/service.ts')).deleteDataset(ctx.app, resource)
  else await (await import('../../applications/service.ts')).deleteApplication(ctx, resource)
}

/**
 * Cascade applied to children that stop being referenced by their parent (parent deleted, or its
 * container edited — then `only` restricts the cascade to the orphaned refs): either delete them,
 * or unflag them so they survive on their own. No per-child permission check: a child exists only
 * to serve its parent and shares its lifecycle, so whoever can authorize the parent operation
 * decides what becomes of the children.
 */
const handleChildren = async (ctx: PartOfDeletionContext, parent: ResourceRef, action: ChildrenAction, only?: ResourceRef[]) => {
  for (const childType of parentRules[parent.type].childTypes) {
    const onlyIds = only?.filter(ref => ref.type === childType).map(ref => ref.id)
    if (onlyIds && !onlyIds.length) continue
    const filter = childrenFilter(parent, onlyIds)
    if (action === 'unflag') {
      await collection(childType).updateMany(filter, { $unset: { partOf: 1 } })
    } else {
      const children = await collection(childType).find(filter).toArray()
      for (const child of children) await deleteResource(ctx, childType, child)
    }
  }
}

/**
 * Deletion guard for a parent resource: refuses the deletion (409) while it still has children,
 * unless childrenAction says what becomes of them, then applies that cascade first.
 */
export const handleChildrenBeforeDeletion = async (ctx: PartOfDeletionContext, parentType: ResourceType, parent: any, childrenAction?: string) => {
  const count = await countChildren(parentType, parent)
  if (!count) return
  const action = requireChildrenAction(childrenAction, `Cette ressource a ${count} ressource(s) enfant(s) qui n'existent que dans ce cadre. Précisez "childrenAction=delete" pour les supprimer aussi, ou "childrenAction=unflag" pour seulement leur retirer l'attribut enfant.`)
  await handleChildren(ctx, { type: parentType, id: parent.id }, action)
}

export type Orphans = { action: ChildrenAction, refs: ResourceRef[] }

/**
 * Rewriting a parent's container can orphan resources still defined as its partOf children: mirror
 * the deletion guard, restricted to the children the new container no longer references. Only call
 * it when the container is actually being (re)written — an absent container references nothing.
 * Detection is separate from applyOrphans because the cascade is irreversible: it must only run
 * once the write that orphans the children has actually been persisted (it can still be rejected).
 */
export const detectOrphans = async (parentType: ResourceType, parent: any, newContainer: any, childrenAction?: string): Promise<Orphans | undefined> => {
  const referenced = parentRules[parentType].referencedChildRefs(newContainer)
  const children = await listChildrenRefs(parentType, parent)
  const refs = children.filter(child => !referenced.some(ref => ref.type === child.type && ref.id === child.id))
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
 * eligible (see childEligibilityRules) and have no children of its own; it must be referenced by
 * exactly one parent resource — 0 or 2+ makes the relationship ambiguous — which must be the one
 * designated by the patch, and an eligible parent (same account, not itself a child). Denormalizes
 * the parent's current title on the partOf, never trusting the one sent by the client.
 * `resource` is the effective view of the resource: the stored document with the patch applied.
 */
export const prepareAtDefinition = async (childType: ResourceType, resource: any, partOf: PartOf) => {
  if (partOf.type === childType && partOf.id === resource.id) throw httpError(400, 'Une ressource ne peut pas être définie comme son propre enfant')
  childEligibilityRules[childType](resource)
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

/** Reads the parent designated by a partOf and applies the reference-independent eligibility rules. */
const readPartOfParent = async (partOf: PartOf, childOwner: Owner) => {
  const parent = await collection(partOf.type)
    .findOne({ id: partOf.id }, { projection: { _id: 0, id: 1, title: 1, owner: 1, partOf: 1, permissions: 1, isVirtual: 1 } })
  if (!parent) throw httpError(400, 'La ressource parente indiquée n\'existe pas')
  assertEligibleParent({ type: partOf.type, ...parent }, childOwner)
  return parent
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
  childEligibilityRules[childType](resource)
  const parent = await readPartOfParent(resource.partOf, resource.owner)
  if (!canReferenceChild(parent, resource.partOf.type, sessionState)) {
    throw httpError(403, 'Vous n\'avez pas la permission de modifier cette ressource parente pour qu\'elle référence une ressource enfant')
  }
  // the parent's title is denormalized on the child, always trust the current value, not the one sent by the client
  resource.partOf.title = parent.title
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
