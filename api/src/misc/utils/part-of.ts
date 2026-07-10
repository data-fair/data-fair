// Rules shared by the resources that can carry a `partOf` attribute (datasets and applications),
// which declares a resource as the child of the single parent resource it only exists to serve.
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { can } from './permissions.ts'
import type { SessionState } from '@data-fair/lib-express'

export type PartOf = { type: 'dataset' | 'application', id: string, title?: string }
type Owner = { type: string, id: string, department?: string }

/** A parent and its child always live in the same account: departments are distinct permission and storage scopes. */
export const isSameOwner = (a?: Owner, b?: Owner) =>
  !!a && !!b && a.type === b.type && a.id === b.id && (a.department || null) === (b.department || null)

/**
 * Children flagged as `partOf` only exist to serve their parent, so an operation that stops
 * referencing them has to say what becomes of them. Narrows the childrenAction query param, or
 * refuses the request rather than silently orphaning them.
 */
export const requireChildrenAction = (childrenAction: string | undefined, message: string): 'delete' | 'unflag' => {
  if (childrenAction !== 'delete' && childrenAction !== 'unflag') throw httpError(409, message)
  return childrenAction
}

/**
 * Reads the parent declared by a partOf and applies the rules that do not depend on the references
 * between the two resources: it must exist, live in the same account, and not be a child itself
 * (chains would leave silent orphans behind cascading deletions).
 */
export const readPartOfParent = async (partOf: PartOf, childOwner: Owner) => {
  const parent: any = partOf.type === 'dataset'
    ? await mongo.datasets.findOne({ id: partOf.id }, { projection: { _id: 0, id: 1, title: 1, owner: 1, partOf: 1, permissions: 1, isVirtual: 1 } })
    : await mongo.applications.findOne({ id: partOf.id }, { projection: { _id: 0, id: 1, title: 1, owner: 1, partOf: 1, permissions: 1 } })
  if (!parent) throw httpError(400, 'La ressource parente indiquée n\'existe pas')
  if (!isSameOwner(parent.owner, childOwner)) throw httpError(400, 'La ressource parente doit appartenir au même compte que la ressource enfant')
  if (parent.partOf) throw httpError(400, 'La ressource parente est elle-même définie comme enfant d\'une autre ressource, les chaînages ne sont pas autorisés')
  // only a virtual dataset aggregates other datasets, a file/rest/metaOnly one can never be a parent
  if (partOf.type === 'dataset' && !parent.isVirtual) throw httpError(400, 'Seul un jeu de données virtuel peut être la ressource parente d\'un jeu de données')
  return parent
}

/**
 * The write operation on the parent that would make it reference the child. Creating a child under
 * a parent and making that parent point at it are the same right: whoever can do one can do the other.
 */
const canReferenceChild = (parent: any, parentType: 'dataset' | 'application', sessionState: SessionState) =>
  parentType === 'dataset'
    // a member is added to a virtual dataset by patching `virtual`, one of the breaking keys
    ? can('datasets', parent, 'writeDescriptionBreaking', sessionState)
    // an application's configuration is written by two routes, gated by two different operations;
    // the disjunction is deliberate — do not tighten it to writeConfig, that would 403 integrators
    // who reference children through the writeDescription-gated PATCH route
    : can('applications', parent, 'writeConfig', sessionState) ||
      can('applications', parent, 'writeDescription', sessionState)

/**
 * Creation-time gate, used when a child is created directly from its parent. The parent cannot
 * reference the child yet, so the flag-time "used by exactly one parent resource" rule is replaced
 * by a permission check on the parent. It is a write-class check, not the admin-class writePartOf
 * that guards the danger zone: subordinating a resource that already stands on its own is an admin
 * act on that resource, creating one that never stood on its own is not. Whoever holds this right
 * can also unflag the child afterwards, by dropping it from the parent's members.
 */
export const preparePartOfAtCreation = async (partOf: PartOf, childOwner: Owner, sessionState: SessionState) => {
  const parent = await readPartOfParent(partOf, childOwner)
  if (!canReferenceChild(parent, partOf.type, sessionState)) {
    throw httpError(403, 'Vous n\'avez pas la permission de modifier cette ressource parente pour qu\'elle référence une ressource enfant')
  }
  // the parent's title is denormalized on the child, always trust the current value, not the one sent by the client
  partOf.title = parent.title
}
