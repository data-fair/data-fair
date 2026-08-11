import mongo from '#mongo'
import { isMainSettings } from '../../settings/operations.ts'
import { computeCompleteness, COMPLETENESS_KEYS, type CompletenessContext, type CompletenessInput } from './compute-completeness.ts'
import type { AnyBulkWriteOperation, Document } from 'mongodb'

/** The I/O side of the completeness score. `compute-completeness.ts` stays pure. */

const ownerFilter = (owner: { type: string, id: string }) => ({ 'owner.type': owner.type, 'owner.id': owner.id })

/**
 * The owner settings the completeness score is scaled on, in a single projected read: whether the
 * feature is on, the configured weights and bounds, which metadata fields the owner offers, and
 * whether it defined any topic. Always the organization-level settings (`department: {$exists:
 * false}`) — the very document the metadata form reads its options from, so the score counts
 * exactly the fields a user is offered.
 */
export const completenessContext = async (owner: { type: string, id: string }): Promise<CompletenessContext> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { metadataCompleteness: 1, datasetsMetadata: 1, topics: 1, department: 1 } }
  )
  if (!settings || !isMainSettings(settings)) return { config: {}, datasetsMetadata: {}, hasTopics: false }
  return {
    config: settings.metadataCompleteness ?? {},
    datasetsMetadata: settings.datasetsMetadata ?? {},
    hasTopics: !!settings.topics?.length
  }
}

/**
 * Recompute the completeness of every dataset of an organization. A settings change moves the
 * denominator of all of them at once and patches none of them, so the scores have to be rewritten
 * in bulk — otherwise datasets of the same organization would carry percentages computed on
 * different denominators, which makes them incomparable, which is the only thing a percentage is for.
 *
 * This cannot be a single aggregation-pipeline update: the criteria read string lengths and nested
 * fields, so expressing them in Mongo would mean a second copy of the scoring rules in another
 * language, free to drift. Streaming the documents through the one shared function is the point.
 */
export const recomputeOwnerCompleteness = async (owner: { type: string, id: string }) => {
  const context = await completenessContext(owner)
  if (!context.config.active) return 0
  const datasets = mongo.db.collection('datasets')
  const cursor = datasets.find(ownerFilter(owner), {
    // derived from the criteria themselves, so it cannot drift if one is ever added
    projection: { _id: 1, ...Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 1])) }
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
    ops.push({
      updateOne: {
        // `_id` and never `id`: the shared mongo client is built with `ignoreUndefined: true`, so a
        // document missing the application-level `id` would collapse the filter to {} and write this
        // dataset's score onto an arbitrary other one.
        filter: { _id: dataset._id },
        update: { $set: { completeness: computeCompleteness(dataset as CompletenessInput, context) } }
      }
    })
    if (ops.length === 1000) await flush()
  }
  await flush()
  return total
}

/**
 * One query. The field simply stops existing, so no reader ever has to consult the settings to know
 * whether to trust it — and no stale score, computed with abandoned weights, is left to be served.
 */
export const clearOwnerCompleteness = async (owner: { type: string, id: string }) => {
  const res = await mongo.db.collection('datasets').updateMany(ownerFilter(owner), { $unset: { completeness: 1 } })
  return res.modifiedCount
}
