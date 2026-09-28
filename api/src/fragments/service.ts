// Mongo-backed operations of the fragments feature: see docs/architecture/fragments.md
import mongo from '#mongo'
import type { Permission, WhoHint } from '#types'
import type { SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import * as permissions from '../misc/utils/permissions.ts'
import type { LogContext } from '../misc/utils/req-context.ts'
import { clearApplicationKeysCaches } from '../misc/utils/application-key.ts'
import { stampHistorize } from '../integrity/operations.ts'
import {
  type PartOf, type FragmentResourceType, type FragmentLike,
  partOfCollectionName, resourceTypeToPartOfType, PART_OF_CHANGE_OPERATION,
  deriveFragmentPermissions, validatePartOf
} from './operations.ts'

const collection = (type: PartOf['type']) => partOfCollectionName(type) === 'datasets' ? mongo.datasets : mongo.applications

export const getParent = async (partOf: PartOf) => {
  return collection(partOf.type).findOne({ id: partOf.id })
}

const fragmentsFilter = (type: PartOf['type'], id: string) => ({ 'partOf.type': type, 'partOf.id': id })

export const countFragments = async (type: PartOf['type'], id: string): Promise<number> => {
  const [nbDatasets, nbApplications] = await Promise.all([
    mongo.datasets.countDocuments(fragmentsFilter(type, id)),
    mongo.applications.countDocuments(fragmentsFilter(type, id))
  ])
  return nbDatasets + nbApplications
}

export const findFragments = async (type: PartOf['type'], id: string) => {
  const [datasets, applications] = await Promise.all([
    mongo.datasets.find(fragmentsFilter(type, id)).toArray(),
    mongo.applications.find(fragmentsFilter(type, id)).toArray()
  ])
  return { datasets, applications }
}

/**
 * Validate that `fragment` may become a fragment of `partOf` for the session and return the parent
 * and the derived ACL. Used at creation and at attach. The parent must be readable by the caller
 * (404 otherwise, so that unreadable ids are not distinguishable from unknown ones).
 */
export const preparePartOf = async (resourceType: FragmentResourceType, fragment: FragmentLike, partOf: PartOf, sessionState: SessionState) => {
  const parent = await getParent(partOf)
  const parentType = partOfCollectionName(partOf.type)
  if (!parent || !permissions.can(parentType, parent as any, 'readDescription', sessionState)) {
    throw httpError(404, `Ressource parente inconnue (${partOf.type} ${partOf.id})`)
  }
  const nbFragments = fragment.id ? await countFragments(resourceTypeToPartOfType(resourceType), fragment.id) : 0
  const error = validatePartOf({ fragmentType: resourceType, fragment, partOf, parent: parent as any, nbFragments })
  if (error) throw httpError(400, error)
  return { parent, permissions: deriveFragmentPermissions(parent.permissions as Permission[] | undefined, parentType, resourceType) }
}

/** the shape applyPartOfChange needs of the resource it re-parents — a dataset or an application */
export type FragmentResource = { id: string, owner: { type: string, id: string, department?: string }, partOf?: PartOf, permissions?: Permission[], integrity?: { active?: boolean } }

/**
 * Attach (partOf set) or detach (partOf null) an existing resource. Gated by the operation that gates
 * the owner-change route (spec §3.5). Detach keeps the stored ACL as it is (spec §3.6).
 */
export const applyPartOfChange = async <T extends FragmentResource> (resourceType: FragmentResourceType, resource: T, partOf: PartOf | null, sessionState: SessionState, who?: WhoHint): Promise<T> => {
  if (!permissions.can(resourceType, resource as any, PART_OF_CHANGE_OPERATION[resourceType], sessionState)) {
    throw httpError(403, 'Vous n\'avez pas la permission de rattacher ou détacher cette ressource')
  }
  const update: { $set: Record<string, any>, $unset?: Record<string, any> } = { $set: { updatedAt: new Date().toISOString() } }
  if (partOf) {
    if (resource.partOf) throw httpError(400, 'La ressource est déjà un fragment, détachez-la avant de la rattacher à un autre parent')
    const prepared = await preparePartOf(resourceType, resource, partOf, sessionState)
    update.$set.partOf = partOf
    update.$set.permissions = prepared.permissions
  } else {
    if (!resource.partOf) return resource
    update.$unset = { partOf: true }
  }
  if (resourceType === 'datasets' && resource.integrity?.active) {
    // ACL and parentage are high forensic-value metadata writes, like PUT /permissions
    stampHistorize(update as any, { operation: 'update', origin: 'user', ...(who ? { who } : {}) })
  }
  // (branched rather than resolving a shared collection variable: a Collection<Dataset> | Collection<Application>
  // union is not callable, findOneAndUpdate's overloads don't unify across the two document types)
  const updated = resourceType === 'datasets'
    ? await mongo.datasets.findOneAndUpdate({ id: resource.id }, update as any, { returnDocument: 'after' })
    : await mongo.applications.findOneAndUpdate({ id: resource.id }, update as any, { returnDocument: 'after' })
  // racing delete (the parent's cascade, or a concurrent DELETE): the document is gone, so is the
  // parentage change. 404 rather than letting both call sites dereference null and 500
  if (!updated) throw httpError(404, 'La ressource a été supprimée pendant la modification de son rattachement')
  if (resourceType === 'applications') {
    // findCallingApplication memoizes { id, partOf, permissions } for 30s and both application-context
    // proofs read partOf from it. Without this, a detached sub-application still resolves as a fragment
    // of its ex-parent for up to 30s — a fail-open window on every detach. The PATCH route returns
    // early for a partOf-only body (exactly what the UI sends), so patchApplication's own clear
    // never runs; clearing here covers every call site of this function.
    clearApplicationKeysCaches()
  }
  return updated as unknown as T
}

/** Recompute the derived ACL of every fragment of `parent` (spec §3.7). At most three updateMany. */
export const syncFragmentPermissions = async (parentType: FragmentResourceType, parent: { id: string, permissions?: Permission[] }) => {
  const type = resourceTypeToPartOfType(parentType)
  const filter = fragmentsFilter(type, parent.id)
  const updatedAt = new Date().toISOString()
  const $set = { permissions: deriveFragmentPermissions(parent.permissions, parentType, 'datasets'), updatedAt }
  // `permissions` is integrity-covered metadata: an unstamped writer makes the fragment's next
  // integrity check report a metadata tamper breach for a legitimate system write. Split in two so
  // the stamp stays single-document atomic with the write it accounts for (the same posture as the
  // fragment's own attach/detach above and as PUT /permissions), rather than the two-phase
  // stampHistorizeMany the self-invalidating $pull/$unset propagations are forced into.
  // `propagation`, not `user`: the actor edited the PARENT's ACL, this write is its fan-out.
  await mongo.datasets.updateMany({ ...filter, 'integrity.active': { $ne: true } }, { $set })
  await mongo.datasets.updateMany(
    { ...filter, 'integrity.active': true },
    stampHistorize({ $set }, { operation: 'update', origin: 'propagation' }) as any
  )
  if (parentType === 'applications') {
    // applications have no integrity trail
    await mongo.applications.updateMany(filter, { $set: { permissions: deriveFragmentPermissions(parent.permissions, parentType, 'applications'), updatedAt } })
  }
}

/**
 * Delete every fragment of a parent through the full service deletes (journal, index, files, keys).
 * Dynamic imports: datasets/service and applications/service both import this module.
 */
export const deleteFragments = async (app: any, ctx: { sessionState: SessionStateAuthenticated, logCtx: LogContext }, parentType: PartOf['type'], parentId: string) => {
  const { datasets, applications } = await findFragments(parentType, parentId)
  if (datasets.length) {
    const { deleteDataset, mergeDraft } = await import('../datasets/service.ts')
    const { syncDataset: syncRemoteService } = await import('../remote-services/service.ts')
    for (const datasetFull of datasets) {
      const dataset = mergeDraft({ ...datasetFull })
      await deleteDataset(app, dataset)
      if (dataset.draftReason && datasetFull.status !== 'draft') await deleteDataset(app, datasetFull)
      await syncRemoteService({ ...datasetFull, masterData: null } as any)
    }
    // safety net mirroring the DELETE /:datasetId route (spec §6): deleteDataset only recomputes
    // the owner's cached total for a non-virtual, non-draft dataset, so a draft-only fragment would
    // otherwise leave it stale. Once for the whole batch, not per fragment.
    // This call is genuinely redundant on the dataset-parent path (that route's own DELETE handler
    // ends with an unconditional updateTotalStorage on the same owner), but it is the ONLY recompute
    // on the application-parent path: applications/service.ts's deleteApplication has no trailing
    // recompute of its own. Keeping it here makes deleteFragments self-consistent regardless of
    // which router calls it — do not remove it as apparent dead weight on the dataset path.
    const parent = await getParent({ type: parentType, id: parentId } as PartOf)
    if (parent) {
      const { updateTotalStorage } = await import('../datasets/utils/storage.ts')
      await updateTotalStorage(parent.owner as any)
    }
  }
  if (applications.length) {
    const { deleteApplication } = await import('../applications/service.ts')
    for (const application of applications) await deleteApplication(ctx, application as any)
  }
}
