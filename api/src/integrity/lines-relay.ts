import mongo from '#mongo'
import config from '#config'
import type { RestDataset, DatasetLine } from '#types'
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
export const anchorLine = async (dataset: RestDataset, line: DatasetLine, store: IntegrityStore, retainUntil: Date, contextHint?: HistorizeContextHint): Promise<void> => {
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
  } else {
    const payload = lops.cleanedLineBody(line)
    const sha256 = lops.lineSha256(line)
    await store.writeRevision(
      lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, sha256),
      { hash: { sha256 }, context, dataset: { id: dataset.id, slug: dataset.slug }, line: lineMeta, payload },
      retainUntil
    )
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
    await c.updateMany({ _needsHistorizing: { $exists: true } }, { $unset: { _needsHistorizing: '' } })
    await clearHint()
    return
  }

  const store = integrityStore()
  const retentionDays = config.integrity.retention?.days ?? 365
  while (true) {
    const lines = await c.find({ _needsHistorizing: { $exists: true } }).limit(BATCH).toArray()
    if (!lines.length) break
    const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
    await Promise.all(lines.map(async (line) => {
      await anchorLine(dataset, line, store, retainUntil)
      // clear conditionally on _i: a legit write interleaved since our read changed _i and
      // re-stamped — that fresh stamp must survive to get its own revision
      await c.updateOne({ _id: line._id, _i: line._i }, { $unset: { _needsHistorizing: '' } })
      // purge a fully-committed tombstone (commitLines defers to us when our flag was still set)
      if (line._deleted) {
        await c.deleteOne({ _id: line._id, _deleted: true, _needsIndexing: { $exists: false }, _needsHistorizing: { $exists: false } })
      }
    }))
  }
  await clearHint()
}
