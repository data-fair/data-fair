// Storage accounting for the integrity store (architecture §9): the per-owner historized prefix
// size is metered into the owner's existing storage consumption. The measure walks the store
// itself (every version's size — revision JSONs, .file payloads, noncurrent duplicates), NOT the
// datasets collection, so the aging-out tail of a deleted dataset keeps counting until the purge
// reclaims it: those bytes are genuinely held either way. Rides the daily checker pass under the
// same cross-pod lock (see checker.ts); a failed measure only delays accounting, never protection.
import mongo from '#mongo'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { IntegrityStore } from './store.ts'
import * as ops from './operations.ts'
import { updateTotalStorage } from '../datasets/utils/storage.ts'

export type IntegrityStorageDoc = {
  _id: string // the owner prefix, e.g. 'data-fair/organization-abc/'
  owner: { type: 'user' | 'organization', id: string }
  size: number
  date: string
}

export const integrityStorageCollection = () => mongo.db.collection<IntegrityStorageDoc>('integrity-storage')

export type MeasureResult = { owners: number, size: number }

export const measureIntegrityStorage = async (store: IntegrityStore): Promise<MeasureResult> => {
  const result: MeasureResult = { owners: 0, size: 0 }
  const ownerPrefixes = await store.listSubPrefixes(ops.SERVICE_PREFIX)
  for (const ownerPrefix of ownerPrefixes) {
    const owner = ops.parseOwnerPrefix(ownerPrefix)
    if (!owner) continue
    let size = 0
    for await (const page of store.iterateVersionPages(ownerPrefix)) {
      for (const version of page) size += version.size ?? 0
    }
    result.owners++
    result.size += size
    await integrityStorageCollection().updateOne(
      { _id: ownerPrefix },
      { $set: { owner, size, date: new Date().toISOString() } },
      { upsert: true }
    )
    // refresh the metered consumption now: an owner whose only remaining historized data is a
    // deleted dataset's tail gets no organic updateStorage call to pick the new figure up
    try {
      await updateTotalStorage(owner)
    } catch (err) {
      internalError('integrity-storage-consumption', err)
    }
  }
  // owners fully reclaimed from the store: drop their figure and release the metered bytes
  const stale = await integrityStorageCollection().find({ _id: { $nin: ownerPrefixes } }).toArray()
  for (const doc of stale) {
    await integrityStorageCollection().deleteOne({ _id: doc._id })
    try {
      await updateTotalStorage(doc.owner)
    } catch (err) {
      internalError('integrity-storage-consumption', err)
    }
  }
  return result
}
