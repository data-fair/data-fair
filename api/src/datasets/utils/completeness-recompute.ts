import mongo from '#mongo'
import equal from 'fast-deep-equal'
import { type Settings } from '#types/settings/index.js'
import { isMainSettings } from '../../settings/operations.ts'
import { computeCompleteness, COMPLETENESS_KEYS, type CompletenessContext, type CompletenessInput } from './compute-completeness.ts'
import type { AnyBulkWriteOperation, Document } from 'mongodb'

// I/O side of the completeness score; compute-completeness.ts stays pure.

const ownerFilter = (owner: { type: string, id: string }) => ({ 'owner.type': owner.type, 'owner.id': owner.id })

const EMPTY_CONTEXT: CompletenessContext = { config: {}, datasetsMetadata: {}, hasTopics: false }

export const completenessContextOf = (settings: Settings): CompletenessContext => ({
  config: settings.metadataCompleteness ?? {},
  datasetsMetadata: settings.datasetsMetadata ?? {},
  hasTopics: !!settings.topics?.length
})

// org-level settings the score is scaled on, in one projected read. Not memoized on purpose: a stale
// cache entry would rescore on abandoned weights after the batch pass already moved on.
export const completenessContext = async (owner: { type: string, id: string }): Promise<CompletenessContext> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { metadataCompleteness: 1, datasetsMetadata: 1, topics: 1, department: 1 } }
  )
  if (!settings || !isMainSettings(settings)) return EMPTY_CONTEXT
  return completenessContextOf(settings)
}

// Rescore every dataset of an org after a settings change (which patches none of them), so their
// scores stay comparable. Not an aggregation-pipeline update: the criteria would have to be
// reimplemented in Mongo and could drift from the shared scoring function.
export const recomputeOwnerCompleteness = async (owner: { type: string, id: string }, knownContext?: CompletenessContext) => {
  // the settings writer passes the context it already holds, avoiding a re-read that could pick up a
  // concurrent write rather than the config being saved
  const context = knownContext ?? await completenessContext(owner)
  if (!context.config.active) return 0
  const datasets = mongo.db.collection('datasets')
  const cursor = datasets.find(ownerFilter(owner), {
    projection: { _id: 1, completeness: 1, ...Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 1])) }
  })
  let total = 0
  let ops: AnyBulkWriteOperation<Document>[] = []
  const flush = async () => {
    if (!ops.length) return
    await datasets.bulkWrite(ops)
    total += ops.length
    ops = []
  }
  for await (const dataset of cursor) {
    const completeness = computeCompleteness(dataset as CompletenessInput, context)
    if (equal(dataset.completeness, completeness)) continue
    ops.push({
      updateOne: {
        // `_id` and never `id`: the shared client uses ignoreUndefined, so a missing `id` would
        // collapse the filter to {} and write this score onto an arbitrary other dataset
        filter: { _id: dataset._id },
        update: completeness ? { $set: { completeness } } : { $unset: { completeness: 1 } }
      }
    })
    if (ops.length === 1000) await flush()
  }
  await flush()
  return total
}

// drop the field (and any legacy draft.completeness) so no stale score is served
export const clearOwnerCompleteness = async (owner: { type: string, id: string }) => {
  const res = await mongo.db.collection('datasets')
    .updateMany(ownerFilter(owner), { $unset: { completeness: 1, 'draft.completeness': 1 } })
  return res.modifiedCount
}
