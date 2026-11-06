import mongo from '#mongo'
import log from '@data-fair/lib-node/log.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { SessionStateAuthenticated } from '@data-fair/lib-express'
import { rootSettingsFilter, isMainSettings } from '../settings/operations.ts'
import escapeStringRegexp from 'escape-string-regexp'
import { notShelved, onlyShelved, binAudienceFilter, shouldPurge, type Shelved } from './operations.ts'
import { resourceLogFields } from '../misc/utils/log-fields.ts'
import * as notifications from '../misc/utils/notifications.ts'
import catalogsPublicationQueue from '../misc/utils/catalogs-publication-queue.ts'
import { clearApplicationKeysCaches } from '../misc/utils/application-key.ts'
import { findFragments, deleteFragments, getParent } from '../fragments/service.ts'
import { syncDataset as syncRemoteService } from '../remote-services/service.ts'
import { memoizedGetDataset, mergeDraft, deleteDatasetAndFragments } from '../datasets/service.ts'
import { updateTotalStorage } from '../datasets/utils/storage.ts'
import { syncDatasets, deleteApplication } from '../applications/service.ts'

export const DEFAULT_RETENTION_DAYS = 30

type BinResourceType = 'datasets' | 'applications'
type OwnerLike = { type: string, id: string, department?: string }

/** The bin is configured at the organization level only, departments inherit it. */
export const getBinSettings = async (owner: { type: string, id: string }): Promise<{ active: boolean, retentionDays: number }> => {
  const off = { active: false, retentionDays: DEFAULT_RETENTION_DAYS }
  if (owner.type === 'user') return off
  const result = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { _id: 0, type: 1, id: 1, department: 1, bin: 1 } })
  if (!(result && isMainSettings(result) && result.bin)) return off
  return { active: !!result.bin.active, retentionDays: result.bin.retentionDays ?? DEFAULT_RETENTION_DAYS }
}

/** Whether a DELETE by this owner shelves instead of deleting. */
export const binActiveFor = async (owner: OwnerLike): Promise<boolean> =>
  owner.type === 'organization' && (await getBinSettings(owner)).active

const collection = (type: BinResourceType) => type === 'datasets' ? mongo.datasets : mongo.applications

/**
 * Whether a shelved resource holds the ref: a create that explicitly targets it answers 409, an
 * admin must empty or restore the bin first. Slugs are unique per owner (`_uniqueRefs` of this
 * owner), ids are globally unique (the id of a shelved resource of ANY owner, or the insert would
 * crash on the duplicate key).
 */
export const findShelvedRef = async (type: BinResourceType, owner: OwnerLike, ref: string): Promise<boolean> => {
  const count = await collection(type).countDocuments({
    $or: [{ _uniqueRefs: ref, 'owner.type': owner.type, 'owner.id': owner.id }, { id: ref }],
    ...onlyShelved
  }, { limit: 1 })
  return count > 0
}

const shelvedMarker = (sessionState: SessionStateAuthenticated): Shelved => ({
  at: new Date().toISOString(),
  by: { id: sessionState.user.id, name: sessionState.user.name }
})

// a virtual parent keeps the child in virtual.children (it skips shelved children when resolving
// them) but must re-finalize so that its schema drops / picks up the child, as detachFromVirtualParents
const refinalizeVirtualParents = async (datasetIds: string[]) => {
  if (!datasetIds.length) return
  await mongo.datasets.updateMany({ 'virtual.children': { $in: datasetIds } }, { $set: { status: 'indexed' } })
}

// the read memos of this node see the change immediately (other nodes: freshness probes and short TTLs)
const clearReadCaches = () => {
  memoizedGetDataset.clear()
  clearApplicationKeysCaches()
}

/**
 * Shelve the live fragments of a parent along with it, marked `cascade` so a restore of the parent
 * brings them back. A fragment already shelved on its own keeps its own marker.
 */
const shelveFragments = async (parentType: 'dataset' | 'application', parentId: string, owner: OwnerLike, marker: Shelved) => {
  const fragments = await findFragments(parentType, parentId, owner)
  const datasets = fragments.datasets.filter(d => !d.shelved)
  const applications = fragments.applications.filter(a => !a.shelved)
  const cascadeMarker: Shelved = { ...marker, cascade: true }
  if (datasets.length) await mongo.datasets.updateMany({ id: { $in: datasets.map(d => d.id) }, ...notShelved }, { $set: { shelved: cascadeMarker } })
  if (applications.length) await mongo.applications.updateMany({ id: { $in: applications.map(a => a.id) }, ...notShelved }, { $set: { shelved: cascadeMarker } })
  return { datasets, applications }
}

// side effects of a dataset disappearing, as for a real deletion, except the integrity terminal
// revision and the virtual parents detachment (both left to the purge)
const datasetsGone = async (datasets: any[]) => {
  for (const dataset of datasets) {
    catalogsPublicationQueue.deletePublication(dataset.id)
    await syncRemoteService({ ...dataset, masterData: null })
  }
  await refinalizeVirtualParents(datasets.map(d => d.id))
}

/** Place a dataset, with its fragments, in its owner's bin. `datasetFull` is the stored document. */
export const shelveDataset = async (sessionState: SessionStateAuthenticated, dataset: any, datasetFull: any): Promise<void> => {
  const marker = shelvedMarker(sessionState)
  await mongo.datasets.updateOne({ id: datasetFull.id, ...notShelved }, { $set: { shelved: marker } })
  const fragments = await shelveFragments('dataset', datasetFull.id, datasetFull.owner, marker)

  await datasetsGone([datasetFull, ...fragments.datasets])
  for (const application of fragments.applications) await syncDatasets(application)
  clearReadCaches()

  log.info(`dataset shelved ${dataset.slug} (${dataset.id})`, { code: 'df.datasets.shelve', ...resourceLogFields('datasets', dataset) })
  await notifications.send({
    title: 'Jeu de données placé dans la corbeille',
    body: `${dataset.title} (${dataset.slug})`,
    topic: { key: `data-fair:dataset-delete:${dataset.id}` },
    sender: dataset.owner
  }, sessionState)
}

/** Place an application, with its fragments, in its owner's bin. Its keys stay stored but grant nothing. */
export const shelveApplication = async (sessionState: SessionStateAuthenticated, application: any): Promise<void> => {
  const marker = shelvedMarker(sessionState)
  await mongo.applications.updateOne({ id: application.id, ...notShelved }, { $set: { shelved: marker } })
  const fragments = await shelveFragments('application', application.id, application.owner, marker)

  await datasetsGone(fragments.datasets)
  await syncDatasets(application)
  for (const fragmentApplication of fragments.applications) await syncDatasets(fragmentApplication)
  clearReadCaches()

  log.info(`application shelved ${application.slug} (${application.id})`, { code: 'df.applications.shelve', ...resourceLogFields('applications', application) })
  await notifications.send({
    title: 'Application placée dans la corbeille',
    body: `${application.title} (${application.slug})`,
    topic: { key: `data-fair:application-delete:${application.id}` },
    sender: application.owner
  }, sessionState)
}

/**
 * Take a resource out of the bin, with the fragments shelved along with it. Permissions are the
 * caller's concern. The catalog publications removed at shelving are not restored.
 */
export const restore = async (sessionState: SessionStateAuthenticated, type: BinResourceType, id: string): Promise<void> => {
  const doc: any = await collection(type).findOne({ id, ...onlyShelved })
  if (!doc) throw httpError(404, 'Ressource inconnue dans la corbeille')
  // a fragment shelved on its own before its parent: the parent must come back first
  if (doc.partOf && !doc.shelved.cascade && (await getParent(doc.partOf))?.shelved) {
    throw httpError(409, 'Cette ressource est un fragment d\'une ressource qui est elle-même dans la corbeille, restaurez d\'abord la ressource parente')
  }
  const parentType = type === 'datasets' ? 'dataset' : 'application'
  const fragments = await findFragments(parentType, id, doc.owner)
  const datasets = fragments.datasets.filter(d => d.shelved?.cascade)
  const applications = fragments.applications.filter(a => a.shelved?.cascade)

  await collection(type).updateOne({ id }, { $unset: { shelved: '' } })
  if (datasets.length) await mongo.datasets.updateMany({ id: { $in: datasets.map(d => d.id) } }, { $unset: { shelved: '' } })
  if (applications.length) await mongo.applications.updateMany({ id: { $in: applications.map(a => a.id) } }, { $unset: { shelved: '' } })

  const restoredDatasets = type === 'datasets' ? [doc, ...datasets] : datasets
  const restoredApplications = type === 'applications' ? [doc, ...applications] : applications
  for (const dataset of restoredDatasets) await syncRemoteService(dataset)
  await refinalizeVirtualParents(restoredDatasets.map(d => d.id))
  for (const application of restoredApplications) await syncDatasets(application)
  clearReadCaches()

  log.info(`${parentType} restored from the bin ${doc.slug} (${doc.id})`, { code: `df.${type}.restore`, ...resourceLogFields(type, doc) })
  await notifications.send({
    title: type === 'datasets' ? 'Jeu de données restauré depuis la corbeille' : 'Application restaurée depuis la corbeille',
    body: `${doc.title} (${doc.slug})`,
    topic: { key: `data-fair:${parentType}-restore:${id}` },
    sender: doc.owner
  }, sessionState)
}

/**
 * Permanently delete a shelved resource and its fragments, without notification (sent at shelving
 * time) and without session: called by the bin endpoints, the retention cron and the bin disabling.
 * A no-op if the resource is gone or no longer shelved (idempotent, and a concurrent restore wins).
 */
export const purgeItem = async (type: BinResourceType, id: string): Promise<void> => {
  const doc: any = await collection(type).findOne({ id, ...onlyShelved })
  if (!doc) return
  if (type === 'datasets') {
    await deleteDatasetAndFragments({}, mergeDraft({ ...doc }), doc, { notify: false })
  } else {
    await deleteFragments(null, {}, 'application', id, doc.owner, { notify: false })
    await deleteApplication({}, doc, { notify: false })
  }
  log.info(`${type} purged from the bin ${doc.slug} (${doc.id})`, { code: `df.${type}.purge`, ...resourceLogFields(type, doc) })
  // the application path has no recompute of its own, and fragments may be draft-only
  await updateTotalStorage(doc.owner)
}

export type BinItem = {
  type: BinResourceType
  id: string
  slug: string
  title: string
  owner: any
  shelved: Shelved
  storage?: { size: number }
  fragments: number
  purgeAt: string
}

/**
 * The bin of an account: the whole organization for a root account, one department otherwise.
 * Newest first. A fragment shelved with its parent (`cascade`) is counted in the parent's `fragments`.
 * The bin is small, so no pagination and no text index: `q` is an escaped regex on title and slug.
 */
export const listBin = async (account: OwnerLike, q?: string): Promise<{ count: number, results: BinItem[] }> => {
  const { retentionDays } = await getBinSettings(account)
  const filter: Record<string, any> = { ...binAudienceFilter(account), ...onlyShelved }
  const cascaded: Record<string, number> = {}
  const results: BinItem[] = []
  for (const type of ['datasets', 'applications'] as const) {
    const docs: any[] = await collection(type).find(filter).project({ _id: 0, id: 1, slug: 1, title: 1, owner: 1, shelved: 1, partOf: 1, 'storage.size': 1 }).toArray()
    const regexp = q ? new RegExp(escapeStringRegexp(q), 'i') : null
    for (const doc of docs) {
      if (doc.shelved.cascade) {
        // counted whatever the filter, a search on the parent does not hide its fragments
        if (doc.partOf) cascaded[`${doc.partOf.type}:${doc.partOf.id}`] = (cascaded[`${doc.partOf.type}:${doc.partOf.id}`] ?? 0) + 1
        continue
      }
      if (regexp && !regexp.test(doc.title ?? '') && !regexp.test(doc.slug ?? '')) continue
      const item: BinItem = {
        type,
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        owner: doc.owner,
        shelved: doc.shelved,
        fragments: 0,
        purgeAt: new Date(new Date(doc.shelved.at).getTime() + retentionDays * 86400000).toISOString()
      }
      if (type === 'datasets' && doc.storage?.size !== undefined) item.storage = { size: doc.storage.size }
      results.push(item)
    }
  }
  for (const item of results) item.fragments = cascaded[`${item.type === 'datasets' ? 'dataset' : 'application'}:${item.id}`] ?? 0
  results.sort((a, b) => b.shelved.at.localeCompare(a.shelved.at))
  return { count: results.length, results }
}

/** The shelved item a bin route targets, 404 if not shelved or a cascaded fragment (restored with its parent only). */
export const getBinItem = async (type: BinResourceType, id: string): Promise<any> => {
  const doc = await collection(type).findOne({ id, ...onlyShelved }, { projection: { _id: 0, id: 1, owner: 1, shelved: 1 } })
  if (!doc || doc.shelved?.cascade) throw httpError(404, 'Ressource inconnue dans la corbeille')
  return doc
}

/**
 * Purge the items of an owner's bin that are past retention, or all of them if the bin is off.
 * Cascaded fragments go with their parent. The settings are re-read per item, so a bin re-enabled
 * while this runs keeps the items it was not yet past retention for. Returns the count purged.
 */
export const purgeOwner = async (owner: { type: string, id: string }): Promise<number> => {
  const filter = { 'owner.type': owner.type, 'owner.id': owner.id, ...onlyShelved, 'shelved.cascade': { $ne: true } }
  const items: { type: BinResourceType, id: string, at: string }[] = []
  for (const type of ['datasets', 'applications'] as const) {
    const docs = await collection(type).find(filter).project({ _id: 0, id: 1, 'shelved.at': 1 }).toArray()
    for (const doc of docs) items.push({ type, id: doc.id, at: doc.shelved.at })
  }
  items.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
  let count = 0
  for (const item of items) {
    const settings = await getBinSettings(owner)
    if (!shouldPurge(settings, item.at, new Date())) continue
    // one failing item must not block the others, the next run retries it
    try {
      await purgeItem(item.type, item.id)
      count++
    } catch (err) {
      log.error('bin purge failed for an item', { code: 'bin-purge-item', type: item.type, id: item.id, err })
    }
  }
  return count
}
