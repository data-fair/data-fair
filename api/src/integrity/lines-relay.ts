import mongo from '#mongo'
import config from '#config'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { RestDataset, DatasetLine } from '#types'
import type { AnyBulkWriteOperation } from 'mongodb'
import * as restUtils from '../datasets/utils/rest.ts'
import { integrityStore } from './store-factory.ts'
import type { IntegrityStore } from './store.ts'
import * as lops from './lines-operations.ts'
import type { HistorizeContextHint, RevisionContext } from './operations.ts'

const BATCH = 100

// Write one line's locked revision from its CURRENT Mongo state. Shared by the async relay and
// the synchronous _fix path. The revision index is the line's own _i (unique, monotonic,
// changes on every update): no LIST-before-write, retry-forward re-PUTs are idempotent
// (a same-key PUT adds a version on the locked bucket without touching the locked one).
export const anchorLine = async (dataset: RestDataset, line: DatasetLine, store: IntegrityStore, retainUntil: Date, contextHint?: HistorizeContextHint): Promise<boolean> => {
  // adversarial _i (§S4): a value outside the key padding would corrupt the line's whole
  // sequence ordering — refuse, loudly; the caller leaves the stamp pending so the dataset
  // stays 'unknown' and the check-stale alert surfaces the wedge if nobody remediates
  if (!lops.lineIndexInRange(line._i!)) {
    internalError('integrity-line-index', new Error(`refusing to anchor line ${line._id} of dataset ${dataset.id}: _i ${line._i} outside the key padding range`))
    return false
  }
  const hint = contextHint ?? line._needsHistorizing?.context
  const deleted = !!line._deleted
  const context: RevisionContext = {
    operation: hint?.operation ?? (deleted ? 'delete' : 'update'),
    origin: hint?.origin ?? 'worker',
    date: new Date().toISOString(),
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  const lineMeta = { _id: line._id, _i: line._i!, ...(line._updatedAt ? { _updatedAt: new Date(line._updatedAt).toISOString() } : {}) }
  if (deleted) {
    await store.writeRevision(
      lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, lops.DELETED_MARKER),
      { hash: {}, context, dataset: { id: dataset.id, slug: dataset.slug }, line: { ...lineMeta, deleted: true } },
      retainUntil
    )
    return true
  } else {
    // extension-owned columns are excluded from the covered body (see extensionOwnedKeys):
    // the extender rewrites them out-of-pipeline, and they are rebuildable anyway
    const excluded = lops.extensionOwnedKeys(dataset.extensions)
    const payload = lops.cleanedLineBody(line, excluded)
    const sha256 = lops.lineSha256(line, excluded)
    await store.writeRevision(
      lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, sha256),
      { hash: { sha256 }, context, dataset: { id: dataset.id, slug: dataset.slug }, line: lineMeta, payload },
      retainUntil
    )
    return true
  }
}

// The per-line relay behind the historizeLines worker task, driven by the per-line
// _needsHistorizing stamps and the dataset-level _needsHistorizingLines hint.
export const historizeLines = async (dataset: RestDataset): Promise<void> => {
  const c = restUtils.collection(dataset)
  const clearHint = () => mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizingLines: '' } })

  // capability or enrollment gone: drop the stamps rather than retry-storming (same posture as
  // the dataset-level relay). A re-enable later re-stamps everything (backfill).
  if (!config.integrity?.active || !dataset.integrity?.active) {
    // dropped stamps may leave already-indexed tombstone docs in place; harmless (no data
    // loss) and they are purged on a later re-enable's backfill pass
    await c.updateMany({ _needsHistorizing: { $exists: true } }, { $unset: { _needsHistorizing: '' } })
    await clearHint()
    return
  }

  const store = integrityStore()
  const retentionDays = config.integrity.retention?.days ?? 365
  // lines whose anchoring was REFUSED (out-of-range _i, §S4): their stamp stays pending, so
  // exclude them from every further scan of this run — including the straggler re-check, or the
  // re-set hint would re-trigger this task in a hot loop over the same refusal
  const refused: string[] = []
  while (true) {
    const lines = await c.find({ _needsHistorizing: { $exists: true }, _id: { $nin: refused } }).limit(BATCH).toArray()
    if (!lines.length) break
    const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
    // all the batch's S3 PUTs first (concurrent), then ONE Mongo round-trip for the bookkeeping:
    // a crash after some PUTs re-runs the whole batch, and same-key re-PUTs are idempotent
    const anchored = await Promise.all(lines.map(async (line) => ({ line, ok: await anchorLine(dataset, line, store, retainUntil) })))
    const bookkeeping: AnyBulkWriteOperation<DatasetLine>[] = []
    for (const { line, ok } of anchored) {
      if (!ok) { refused.push(line._id); continue }
      // clear conditionally on _i: a legit write interleaved since our read changed _i and
      // re-stamped — that fresh stamp must survive to get its own revision
      bookkeeping.push({ updateOne: { filter: { _id: line._id, _i: line._i }, update: { $unset: { _needsHistorizing: '' } } } })
    }
    for (const { line, ok } of anchored) {
      // purge a fully-committed tombstone (commitLines defers to us when our flag was still set);
      // ordered bulk: runs after the flag clears above, so the _needsHistorizing-absent condition
      // sees this batch's own clear
      if (ok && line._deleted) {
        bookkeeping.push({ deleteOne: { filter: { _id: line._id, _deleted: true, _needsIndexing: { $exists: false }, _needsHistorizing: { $exists: false } } } })
      }
    }
    if (bookkeeping.length) await c.bulkWrite(bookkeeping, { ordered: true })
  }
  await clearHint()
  // hint-first ordering protects against a crash, not against concurrency: an API write can set
  // the (already-set) hint and stamp its lines between our final empty scan and the clear above,
  // orphaning those stamps — the task filter needs the hint, so they would never drain and the
  // checker would read them as a false 'edited' breach. Re-set the hint if any stamp slipped in;
  // the checker carries the same net for the residual window after this re-check.
  const straggler = await c.findOne({ _needsHistorizing: { $exists: true }, _id: { $nin: refused } }, { projection: { _id: 1 } })
  if (straggler) await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
}
