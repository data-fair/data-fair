// Mongo-backed operations of the fragments feature: see docs/architecture/fragments.md
import mongo from '#mongo'
import type { Permission, WhoHint } from '#types'
import type { SessionState, SessionStateAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import * as permissions from '../misc/utils/permissions.ts'
import type { LogContext } from '../misc/utils/req-context.ts'
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

/**
 * Attach (partOf set) or detach (partOf null) an existing resource. Gated by the operation that gates
 * the owner-change route (spec §3.5). Detach keeps the stored ACL as it is (spec §3.6).
 */
export const applyPartOfChange = async (resourceType: FragmentResourceType, resource: any, partOf: PartOf | null, sessionState: SessionState, who?: WhoHint) => {
  if (!permissions.can(resourceType, resource, PART_OF_CHANGE_OPERATION[resourceType], sessionState)) {
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
  return updated
}

/** Recompute the derived ACL of every fragment of `parent` (spec §3.7). At most two updateMany. */
export const syncFragmentPermissions = async (parentType: FragmentResourceType, parent: { id: string, permissions?: Permission[] }) => {
  const type = resourceTypeToPartOfType(parentType)
  const filter = fragmentsFilter(type, parent.id)
  const updatedAt = new Date().toISOString()
  await mongo.datasets.updateMany(filter, { $set: { permissions: deriveFragmentPermissions(parent.permissions, parentType, 'datasets'), updatedAt } })
  if (parentType === 'applications') {
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
