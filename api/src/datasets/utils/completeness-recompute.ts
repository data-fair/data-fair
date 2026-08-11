import mongo from '#mongo'
import equal from 'fast-deep-equal'
import { type Settings } from '#types/settings/index.js'
import { isMainSettings } from '../../settings/operations.ts'
import { computeCompleteness, COMPLETENESS_KEYS, type CompletenessContext, type CompletenessInput } from './compute-completeness.ts'
import type { AnyBulkWriteOperation, Document } from 'mongodb'

/** The I/O side of the completeness score. `compute-completeness.ts` stays pure. */

const ownerFilter = (owner: { type: string, id: string }) => ({ 'owner.type': owner.type, 'owner.id': owner.id })

const EMPTY_CONTEXT: CompletenessContext = { config: {}, datasetsMetadata: {}, hasTopics: false }

/** The three settings keys the score is scaled on, projected out of a settings document. */
export const completenessContextOf = (settings: Settings): CompletenessContext => ({
  config: settings.metadataCompleteness ?? {},
  datasetsMetadata: settings.datasetsMetadata ?? {},
  hasTopics: !!settings.topics?.length
})

/**
 * The owner settings the completeness score is scaled on, in a single projected read: whether the
 * feature is on, the configured weights and bounds, which metadata fields the owner offers, and
 * whether it defined any topic. Always the organization-level settings (`department: {$exists:
 * false}`) — the very document the metadata form reads its options from, so the score counts
 * exactly the fields a user is offered.
 *
 * Deliberately NOT memoized, unlike the other per-owner settings reads of the codebase
 * (`memoizedGetPublicationSiteSettings`, `findApiKeySettings`). A cache entry that outlives a
 * settings save on another node writes a score computed on the abandoned configuration, after the
 * batch pass rescored the organization and moved on — a percentage on a foreign denominator that
 * nothing revisits. Comparability across the datasets of an organization is the entire point of the
 * score, and this projected read on an indexed filter is a poor price for it; it is only paid on a
 * dataset creation and on a metadata patch that touches a scored field.
 */
export const completenessContext = async (owner: { type: string, id: string }): Promise<CompletenessContext> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { metadataCompleteness: 1, datasetsMetadata: 1, topics: 1, department: 1 } }
  )
  if (!settings || !isMainSettings(settings)) return EMPTY_CONTEXT
  return completenessContextOf(settings)
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
export const recomputeOwnerCompleteness = async (owner: { type: string, id: string }, knownContext?: CompletenessContext) => {
  // the caller that just wrote the settings passes the context it already holds: re-reading it
  // would be a third query for the same document, and would rescore the whole organization on a
  // concurrent write that landed in between rather than on the configuration being saved
  const context = knownContext ?? await completenessContext(owner)
  if (!context.config.active) return 0
  const datasets = mongo.db.collection('datasets')
  const cursor = datasets.find(ownerFilter(owner), {
    // derived from the criteria themselves, so it cannot drift if one is ever added. `completeness`
    // comes along to skip the datasets the new configuration does not actually move.
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
    // a weight change moves the score of the datasets that criterion is unfilled on and of no
    // other: writing the rest back identical is a full-collection rewrite for nothing
    if (equal(dataset.completeness, completeness)) continue
    ops.push({
      updateOne: {
        // `_id` and never `id`: the shared mongo client is built with `ignoreUndefined: true`, so a
        // document missing the application-level `id` would collapse the filter to {} and write this
        // dataset's score onto an arbitrary other one.
        filter: { _id: dataset._id },
        // no denominator means nothing was measured, so the field goes away rather than reading 0 %
        update: completeness ? { $set: { completeness } } : { $unset: { completeness: 1 } }
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
 *
 * `draft.completeness` goes with it, like the custom-metadata cleanup does for its own key: the
 * score is never written under the draft subtree any more, but a dataset scored before that fix
 * would otherwise carry it back to the published document when its draft is validated.
 */
export const clearOwnerCompleteness = async (owner: { type: string, id: string }) => {
  const res = await mongo.db.collection('datasets')
    .updateMany(ownerFilter(owner), { $unset: { completeness: 1, 'draft.completeness': 1 } })
  return res.modifiedCount
}
