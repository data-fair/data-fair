import mongo from '#mongo'
import config from '#config'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { RestDataset, DatasetLine } from '#types'
import type { AnyBulkWriteOperation } from 'mongodb'
import * as restUtils from '../datasets/utils/rest.ts'
import { integrityStore } from './store-factory.ts'
import type { IntegrityStore } from './store.ts'
import * as lops from './lines-operations.ts'
import * as ops from './operations.ts'
import type { HistorizeContextHint, RevisionContext } from './operations.ts'

const BATCH = 100
// A run tolerates isolated per-line failures so one poison line cannot hold up the other
// 19999, but bails out once a whole batch's worth has failed: past that it is the store that is
// down, not a line that is bad, and continuing only grows the skip list and wastes the run.
const MAX_LINE_FAILURES = BATCH

// Write one line's locked revision from its CURRENT Mongo state. Shared by the async relay and
// the synchronous _fix path. The revision index is the line's own _i (unique, monotonic,
// changes on every update): no LIST-before-write, retry-forward re-PUTs are idempotent
// (a same-key PUT adds a version on the locked bucket without touching the locked one).
// `attributionRetainUntil` is normally computed once per relay batch (mirrors the revision
// `retainUntil` above it, historizeLines) and passed down; synchronous single-line callers
// (_fix's tombstone bless) may omit it and let this function compute its own from config.
export const anchorLine = async (dataset: RestDataset, line: DatasetLine, store: IntegrityStore, retainUntil: Date, contextHint?: HistorizeContextHint, attributionRetainUntil?: Date): Promise<boolean> => {
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
    // the stamp's own date when it has one: re-anchoring the same stamp then reproduces a
    // byte-identical body, so a retry's same-key re-PUT is genuinely idempotent instead of
    // planting a `version-divergence` the trail check reports at 'confirmed'. Pre-existing
    // stamps carry no date — fall back to now, as before.
    date: hint?.date ?? new Date().toISOString(),
    ...(hint?.reason ? { reason: hint.reason } : {})
  }
  // The enrolment backfill stamps EVERY line, so an untouched line is re-anchored at the key it
  // already owns (the key is derived from content: `{_i}-{sha256}`, and neither moved). The body
  // would differ — a fresh enable context — and two differing bodies at one key is exactly the
  // shadowing signature: a disable/re-enable cycle used to report the whole trail as altered,
  // one confirmed anomaly per line plus one per `.who` sibling. Nothing to add here: the existing
  // revision already attests this content at this line version, and the enable itself is recorded
  // in the dataset-level revision. Gated to the backfill — an organic write always mints a fresh
  // `_i`, so its key cannot collide and it must not pay for this probe.
  if (hint?.operation === 'enable') {
    const existingKey = deleted
      ? lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, lops.DELETED_MARKER)
      : lops.lineRevisionKey(dataset.owner, dataset.id, line._id, line._i!, lops.lineSha256(line, lops.extensionOwnedKeys(dataset.extensions)))
    if (await store.objectExists(existingKey)) return true
  }
  // who-FIRST (target 8, README invariant #4, same rationale as anchorDataset): a crash between
  // this write and the revision write below is recovered by retry-forward (the caller leaves the
  // stamp pending and the relay re-visits the same line, recomputing the same key and re-PUTting
  // both) — the reverse order would lose attribution forever, since a same-key re-PUT after a
  // crash there is idempotent and never reaches an unwritten `.who`.
  const who = hint?.who
  const writeWho = async (key: string): Promise<void> => {
    if (ops.shouldWriteWho(who, config.integrity!.attribution?.active)) {
      const effectiveAttributionRetainUntil = attributionRetainUntil ?? ops.computeAttributionRetainUntil(config.integrity!.attribution?.retentionDays)
      await store.writeWho(key, { ...who, date: context.date }, effectiveAttributionRetainUntil)
    }
  }
  const lineMeta = { _id: line._id, _i: line._i!, ...(line._updatedAt ? { _updatedAt: new Date(line._updatedAt).toISOString() } : {}) }
  if (deleted) {
    await writeWho(lops.lineWhoKey(dataset.owner, dataset.id, line._id, line._i!, lops.DELETED_MARKER))
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
    await writeWho(lops.lineWhoKey(dataset.owner, dataset.id, line._id, line._i!, sha256))
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
  // lines whose anchoring THREW (store transient: a throttled PUT, a stalled socket). Unlike
  // `refused` these keep their stamp on purpose and are retried by a later run — they are only
  // skipped for the rest of THIS run so the scan moves on to the lines that can still be
  // anchored instead of re-drawing the same failures. `firstError` is rethrown at the end.
  const failed: string[] = []
  let firstError: any
  while (true) {
    const skip = failed.length ? refused.concat(failed) : refused
    const lines = await c.find({ _needsHistorizing: { $exists: true }, _id: { $nin: skip } }).limit(BATCH).toArray()
    if (!lines.length) break
    const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
    // computed once per batch, like `retainUntil` above (target 8): every `.who` sibling this
    // batch writes shares the same attribution window
    const attributionRetainUntil = ops.computeAttributionRetainUntil(config.integrity.attribution?.retentionDays)
    // all the batch's S3 PUTs first (concurrent), then ONE Mongo round-trip for the bookkeeping:
    // a crash after some PUTs re-runs the whole batch, and same-key re-PUTs are idempotent.
    // Each anchor settles on its own rather than through a rejecting Promise.all: one line's
    // failure would otherwise discard up to 99 completed, already-paid-for S3 writes, which the
    // next run then re-does — on a 20000-line enrolment backfill that is how a single transient
    // parks the whole backfill in 'error' with the retry budget spent.
    const anchored = await Promise.all(lines.map(async (line) => {
      try {
        return { line, ok: await anchorLine(dataset, line, store, retainUntil, undefined, attributionRetainUntil), threw: false }
      } catch (err) {
        firstError ??= err
        return { line, ok: false, threw: true }
      }
    }))
    const bookkeeping: AnyBulkWriteOperation<DatasetLine>[] = []
    for (const { line, ok, threw } of anchored) {
      if (threw) { failed.push(line._id); continue }
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
    // committed before the failure check below: whatever this batch anchored stays anchored
    if (bookkeeping.length) await c.bulkWrite(bookkeeping, { ordered: true })
    if (failed.length >= MAX_LINE_FAILURES) break
  }
  if (firstError) {
    // the hint stays set (we never reach clearHint), so the task re-runs and picks the failed
    // lines back up. Rethrow so the failure is journalled rather than silently swallowed —
    // the progress made above is already committed and is not lost by this throw.
    throw new Error(`failed to anchor ${failed.length} line(s) of dataset ${dataset.id}, the first with: ${firstError.message}`, { cause: firstError })
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
