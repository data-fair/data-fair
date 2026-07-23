// Express-free orchestration for the integrity admin actions (conventions §1/§3): the
// datasets/routes/integrity.ts router extracts inputs and streams responses, everything else
// lives here — callable from workers and tests, throws httpError.
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import mime from 'mime-types'
import clone from '@data-fair/lib-utils/clone.js'
import locks from '@data-fair/lib-node/locks.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { SessionStateAuthenticated } from '@data-fair/lib-express'
import config from '#config'
import mongo from '#mongo'
import filesStorage from '#files-storage'
import type { DatasetInternal, HistorizeContextHint, RestDataset, WhoHint } from '#types'
import type { WhoBody } from './operations.ts'
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import * as journals from '../misc/utils/journals.ts'
import { preparePatch } from '../datasets/utils/patch.ts'
import { fallbackMimeTypes } from '../datasets/utils/upload.ts'
import { applyPatch } from '../datasets/service.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import { integrityStore } from './store-factory.ts'
import * as ops from './operations.ts'
import * as lops from './lines-operations.ts'
import { anchorDataset } from './relay.ts'
import { historizeLines, anchorLine } from './lines-relay.ts'
import { checkDataset, compareDatasetLines, type Check } from './checker.ts'
import { resetPurgeWatermark } from './purge.ts'
import { sha256OfStorageFile, md5Tee } from './hash.ts'

const LINE_IO_CONCURRENCY = 100

export const ATTACHMENT_CONCEPT = 'http://schema.org/DigitalDocument'
export const hasAttachmentField = (dataset: DatasetInternal): boolean =>
  !!(dataset.schema ?? []).find((f: any) => f['x-refersTo'] === ATTACHMENT_CONCEPT)

const retentionWindow = (): Date =>
  new Date(Date.now() + (config.integrity?.retention?.days ?? 365) * 24 * 3600 * 1000)

const getRevisionOr404 = async (key: string) => {
  return await integrityStore().getRevision(key).catch((err: any) => {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw httpError(404, 'unknown revision')
    throw err
  })
}

// The `.who` attribution sibling is normally ABSENT (worker/propagation writes carry none, and
// every sibling ages out at the 180-day attribution retention while its revision lives on for
// up to 365 days — design §1.1/§6.2): never let a missing/unreadable `.who` fail a revision read,
// mirroring getRevisionOr404's own 404 normalization but swallowing rather than rethrowing.
const getWhoOrUndefined = async (key: string): Promise<WhoBody | undefined> => {
  return await integrityStore().getWho(key).catch((err: any) => {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return undefined
    throw err
  })
}

const requireActive = (dataset: DatasetInternal): void => {
  if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
}

// Every synchronous admin action runs under the standard per-dataset worker lock (the same
// `datasets:‹id›` lock the relay/checker tasks hold, workers/index.ts): without it an inline
// anchor can race the relay to the same LIST-derived revision index — both PUT the same key,
// the loser becomes a shadowed noncurrent version, and the purge later reclaims it (permanent
// trail loss). Bounded wait then 409: admin actions are rare, a busy dataset answers quickly
// rather than queueing.
const LOCK_RETRY_MS = 250
export const withDatasetLock = async <T>(datasetId: string, fn: () => Promise<T>): Promise<T> => {
  const lockKey = `datasets:${datasetId}`
  const deadline = Date.now() + (config.integrity?.lockWaitMs ?? 10000)
  while (!(await locks.acquire(lockKey, 'integrity-admin'))) {
    if (Date.now() >= deadline) throw httpError(409, 'dataset is busy (a background task is processing it), retry later')
    await sleep(LOCK_RETRY_MS)
  }
  try {
    return await fn()
  } finally {
    await locks.release(lockKey)
  }
}

export const enableIntegrity = async (dataset: DatasetInternal, who?: WhoHint): Promise<void> =>
  await withDatasetLock(dataset.id, () => enableIntegrityUnlocked(dataset, who))

const enableIntegrityUnlocked = async (dataset: DatasetInternal, who?: WhoHint): Promise<void> => {
  if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
  const isRest = isRestDataset(dataset)
  if (!isRest && (!isFileDataset(dataset) || !dataset.originalFile?.md5)) {
    throw httpError(400, 'integrity can only be enabled on a finalized file dataset or an editable (rest) dataset')
  }
  // Truth-grounding refusals (§5 explicit limits): never enroll a dataset whose stated guarantee
  // would be partial. Attachment bytes are outside the snapshot — neither detected nor restorable —
  // so an 'ok' verdict would overstate the coverage; a lines-owner dataset's _owner/_ownerName
  // attribution is outside the line snapshot and would be silently DROPPED by lines/_restore and
  // _fix's bless. The dataset PATCH route refuses the reverse transitions while active.
  if (hasAttachmentField(dataset)) {
    throw httpError(400, 'integrity cannot be enabled on a dataset with attachments: attachment files are not covered by the integrity guarantee')
  }
  if (isRest && dataset.rest?.lineOwnership) {
    throw httpError(400, 'integrity cannot be enabled on a dataset with line ownership: line owner attribution is not covered by the integrity guarantee and would be lost on restore')
  }
  if (isRest) {
    // the coverage gate (target 3): per-line anchors mean per-line writes, checks and lock
    // renewals — refuse enrollment where that burden is not tractable
    const maxLines = config.integrity.lines?.maxLines ?? 100000
    const liveLines = await restUtils.count(dataset, { _deleted: { $ne: true } })
    if (liveLines > maxLines) throw httpError(409, `this dataset has ${liveLines} lines, above the integrity gate of ${maxLines}`)
  }
  // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
  // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
  // seed the check-stale clocks (§S3): a never-checked enrollment trips the alert after
  // maxUnknownDays instead of staying silent forever — the index verdict carries its own clock
  // (it can stay 'unknown' while the overall check is definitive)
  const enableDate = new Date().toISOString()
  const $set: Record<string, any> = { 'integrity.active': true, 'integrity.lastDefinitiveCheck': enableDate, 'integrity.lastDefinitiveIndexCheck': enableDate, updatedAt: new Date().toISOString() }
  // baseline for the per-line renewal cadence: conservative (backfill revisions written by
  // the relay get equal-or-later locks, so renewal triggers no later than needed)
  if (isRest) $set['integrity.linesRenewal'] = { date: new Date().toISOString(), status: 'ok', retainUntil: retentionWindow().toISOString() }
  await mongo.datasets.updateOne({ id: dataset.id }, { $set })
  // anchor synchronously: enable is a rare superadmin action, and the response then reflects
  // the anchored state. On failure (S3 down) active stays true with no anchor — the check
  // reports 'unknown' and a later _fix retries (fail-loud, no compensating rollback).
  const context: HistorizeContextHint = { operation: 'enable', origin: 'superadmin', ...(who ? { who } : {}) }
  await anchorDataset(dataset, context)
  if (isRest) {
    // async backfill: stamp every line (hint-first) and let the relay drain; GET _integrity
    // reports pending progress and checks stay 'unknown' until drained. Reusing the same
    // `context` (rather than rebuilding a fresh literal) means the backfill lines carry the
    // enabling admin's `who` too (target 4 consumes it in anchorLine) with no extra plumbing.
    await restUtils.collection(dataset).createIndex({ _needsHistorizing: 1 }, { sparse: true })
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
    await restUtils.collection(dataset).updateMany({}, { $set: { _needsHistorizing: { context } } })
  }
}

export const disableIntegrity = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<void> =>
  await withDatasetLock(dataset.id, () => disableIntegrityUnlocked(dataset, reason, who))

const disableIntegrityUnlocked = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<void> => {
  // terminal trail revision FIRST (round 3 §S2, deliberate inversion of the hot-first rule): a
  // crash after the Mongo flip but before the revision leaves exactly the alarm-kill signature
  // the scope audit hunts; the reverse residue (terminal revision, still-active dataset) is
  // benign and self-healed by the checker. force: the revision must land even when the hashes
  // match the latest anchor. An S3 outage therefore blocks disable — fail-loud, retry later.
  if (dataset.integrity?.active) {
    await anchorDataset(dataset, { operation: 'disable', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }, { force: true })
  }
  // the anchors stop being purge-protected at this moment, so the scope's watermark — computed
  // while they still were — must not delay their aging out
  await resetPurgeWatermark(dataset.owner, dataset.id)
  await mongo.datasets.updateOne({ id: dataset.id }, {
    // clear the verdicts and any pending relay work: a disabled dataset must not keep showing
    // a breach badge / error-filter listing it no longer allows acting on
    $set: { integrity: { active: false }, updatedAt: new Date().toISOString() },
    $unset: { _needsHistorizing: '', _needsHistorizingLines: '' }
  })
  // per-line stamp residue (M2): with the hint gone the relay will never visit these lines, and
  // a later re-enable's backfill re-stamps everything anyway — sweep them now. After the dataset
  // update above so a racing line write cannot re-stamp behind the sweep.
  if (isRestDataset(dataset)) {
    await restUtils.collection(dataset).updateMany({ _needsHistorizing: { $exists: true } }, { $unset: { _needsHistorizing: '' } })
  }
}

export const getIntegrityState = async (dataset: DatasetInternal): Promise<Record<string, any>> => {
  const integrity: Record<string, any> = { ...(dataset.integrity ?? { active: false }) }
  if (integrity.active && isRestDataset(dataset)) {
    const c = restUtils.collection(dataset)
    const maxLines = config.integrity?.lines?.maxLines ?? 100000
    const [total, pending] = await Promise.all([
      restUtils.count(dataset, { _deleted: { $ne: true } }),
      c.countDocuments({ _needsHistorizing: { $exists: true }, _deleted: { $ne: true } }) // live lines only — tombstones pending their deletion revision would make anchored undercount
    ])
    integrity.lines = { anchored: Math.max(0, total - pending), pending, ...(total > maxLines ? { overGate: true } : {}) }
  }
  return integrity
}

// Shared core of _fix's bless and lines/_restore: rewrite lines through the standard transaction
// pipeline (the rewrite itself is a legitimate write producing fresh revisions), then drain the
// relay inline so the caller's re-check compares against anchored truth.
// An out-of-band edit that mutates a field directly leaves the doc's stored _hash stale — still
// reflecting the pre-tamper content — and the rewrite may put back content whose freshly computed
// hash lands exactly on that stale value: createOrUpdate's `_hash: {$ne: target}` upsert filter
// would then see "no change" and silently skip the write (a no-op 304), leaving the tamper in
// place. Invalidate the stale field first so the pipeline cannot mistake the deliberate rewrite
// for a redundant one.
const rewriteLinesThroughPipeline = async (dataset: DatasetInternal & RestDataset, transacs: any[], hint: HistorizeContextHint): Promise<void> => {
  if (!transacs.length) return
  const c = restUtils.collection(dataset)
  const rewriteIds = transacs.filter((t) => t._action === 'createOrUpdate').map((t) => t._id)
  if (rewriteIds.length) await c.updateMany({ _id: { $in: rewriteIds } }, { $set: { _hash: null } })
  await restUtils.applyTransactions(dataset, undefined, transacs, undefined, undefined, undefined, hint)
  // route the rewritten lines through extension/indexing like any partial rest update
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _partialRestStatus: 'updated' } })
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  await historizeLines(fresh as unknown as RestDataset)
}

export const fixIntegrity = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> =>
  await withDatasetLock(dataset.id, () => fixIntegrityUnlocked(dataset, reason, who))

const fixIntegrityUnlocked = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> => {
  requireActive(dataset)
  // synchronous re-anchor + verify: the reconcile action responds with a fresh verdict
  await anchorDataset(dataset, { operation: 'fixIntegrity', origin: 'superadmin', reason, who })
  // the synchronous anchor above just serviced whatever a pending stamp requested: clear it so
  // checkDataset's pending guard doesn't force an 'unknown' verdict on the fresh read below
  await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
  // Target 3: bless the current line state — fresh revisions for edited/inserted live lines,
  // tombstone revisions for anchored-but-vanished lines, all inline (bounded by the gate)
  if (isRestDataset(dataset)) {
    const store = integrityStore()
    await historizeLines(dataset)
    const compare = await compareDatasetLines(dataset, store)
    const hint: HistorizeContextHint = { operation: 'fixIntegrity', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }
    // edited + inserted lines: bless the CURRENT content as the new legitimate truth by
    // re-writing it through the standard transaction pipeline (the same mechanism
    // lines/_restore uses) rather than anchoring directly at the line's current `_i`.
    // A direct anchor there is nondeterministic/broken: an equal-`_i` tie against the still-live
    // stale anchor can lose (latestLineAnchors keeps the lexically-first key on a tie between
    // the old and new sha at the same i), an `_i`-rewind tamper can never outrank the stale
    // anchor, and an out-of-band-inserted line can be shadowed by a higher-i tombstone. The
    // pipeline always mints a fresh `_i` strictly greater than any prior anchor's, so the
    // blessed anchor deterministically becomes latest.
    const blessIds = [...compare.edited, ...compare.inserted]
    if (blessIds.length) {
      const liveLines = await restUtils.collection(dataset).find({ _id: { $in: blessIds } }).toArray()
      const excluded = lops.extensionOwnedKeys(dataset.extensions)
      const transacs = liveLines.map((line) => ({ _action: 'createOrUpdate' as const, _id: line._id, ...lops.cleanedLineBody(line, excluded) }))
      await rewriteLinesThroughPipeline(dataset, transacs, hint)
    }
    // tombstone revisions for vanished lines: continue each sequence past its stale anchor
    const retainUntil = retentionWindow()
    for (let offset = 0; offset < compare.missing.length; offset += LINE_IO_CONCURRENCY) {
      await Promise.all(compare.missing.slice(offset, offset + LINE_IO_CONCURRENCY).map((lineId) => {
        const anchor = compare.anchors.get(lineId)!
        return anchorLine(dataset, { _id: lineId, _i: anchor.i + 1, _deleted: true }, store, retainUntil, hint)
      }))
    }
    // Adversarial _i inflation (§S4): the bless above mints a time-derived _i — a forged anchor
    // index above any clock-derived value can therefore never be outranked by it, wedging the
    // remediation (the fresh anchor never becomes latest). Detect the non-convergent shape
    // (still 'edited' with live _i below the anchor index) and correct the line's _i explicitly
    // past the stale anchor — stamped and reindexed in the same single-document write — then
    // drain again so the final verdict below proves convergence.
    const recompare = await compareDatasetLines(dataset, store)
    const stillEdited = recompare.edited.length
      ? await restUtils.collection(dataset).find({ _id: { $in: recompare.edited } }).toArray()
      : []
    let corrected = false
    for (const line of stillEdited) {
      const anchor = recompare.anchors.get(line._id)
      if (!anchor || (line._i ?? 0) >= anchor.i) continue // not the wedge shape
      let targetI = anchor.i + 1
      if (!lops.lineIndexInRange(targetI)) continue // unfixable without corrupting the key layout — stays a breach, loudly
      if (!corrected) {
        // hint FIRST (outbox ordering), like every lines writer
        await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true } })
        corrected = true
      }
      while (true) {
        try {
          await restUtils.collection(dataset).updateOne(
            { _id: line._id },
            { $set: { _i: targetI, _hash: null, _needsIndexing: true, _needsHistorizing: { context: hint } } }
          )
          break
        } catch (err: any) {
          if (err.code === 11000 && lops.lineIndexInRange(targetI + 1)) { targetI++; continue } // another line holds this _i
          throw err
        }
      }
    }
    if (corrected) {
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _partialRestStatus: 'updated' } })
      const freshAfterCorrection = await mongo.datasets.findOne({ id: dataset.id })
      await historizeLines(freshAfterCorrection as unknown as RestDataset)
    }
  }
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  const check = await checkDataset(fresh as unknown as DatasetInternal)
  // _fix means "the current source state is the new truth". For a FILE dataset, blessing changes
  // the DERIVATION SOURCE: a tamper that changed CONTENT (not merely corrupted a hash) leaves the
  // ES projection holding the PRE-bless rows, which the A1 index verdict correctly flags as
  // diverged — so _fix completes the action by rebuilding the projection from the blessed source.
  // Trigger condition (precise): FILE dataset whose post-bless re-check reports index 'diverged';
  // a metadata-only bless leaves the projection consistent (index 'ok') → no reindex churn, and
  // ES unavailable (index 'unknown') proves nothing about the projection → no reindex.
  //
  // This does NOT mean a bless always heals an index divergence. An ES-ONLY tamper (the source is
  // untouched, only the alias/index was written) is NOT _fix's job on either family: there is no
  // source to re-bless, so _fix corrects nothing and the re-check still returns breach ['index']
  // with no completion. That asymmetry is deliberate — the dedicated panel reindex action
  // (`index/_reindex`) is the remedy for an ES-only divergence, for FILE and REST alike. (REST
  // line blesses route through rewriteLinesThroughPipeline, which sets _partialRestStatus, so a
  // divergence caused by a stale projection reports 'unknown' here, not 'diverged'.)
  if (isFileDataset(dataset) && check.index?.status === 'diverged') {
    // journalIndexRepairAndReindex journals the divergence evidence BEFORE reindex overwrites it
    // (the A1 invariant) and returns the patched doc — reindex set status to a non-finalized value
    // via findOneAndUpdate(returnDocument:'after'). Feed THAT doc to the re-check so pendingState
    // sees the pending projection and reports index 'unknown' (converging), not a stale compare.
    const patched = await journalIndexRepairAndReindex(dataset, check.index, reason)
    return await checkDataset(patched as unknown as DatasetInternal)
  }
  return check
}

// Target 3: restore every diverged line to its last verified state, through the standard
// transaction pipeline. Synchronous: drains the relay inline and returns the fresh verdict.
export const restoreLines = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> =>
  await withDatasetLock(dataset.id, () => restoreLinesUnlocked(dataset, reason, who))

const restoreLinesUnlocked = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> => {
  requireActive(dataset)
  if (!isRestDataset(dataset)) throw httpError(400, 'lines restore only applies to an editable (rest) dataset')
  const store = integrityStore()
  // drain any pending organic stamps first so the comparison sees anchored truth
  await historizeLines(dataset)
  const compare = await compareDatasetLines(dataset, store)
  const transacs: any[] = []
  // edited lines and out-of-band-deleted lines: rewrite from the latest revision's payload
  const fetchIds = [...compare.edited, ...compare.missing]
  for (let offset = 0; offset < fetchIds.length; offset += LINE_IO_CONCURRENCY) {
    await Promise.all(fetchIds.slice(offset, offset + LINE_IO_CONCURRENCY).map(async (lineId) => {
      const anchor = compare.anchors.get(lineId)!
      const rev: any = await store.getRevision(anchor.key)
      if (!rev.payload) return // defensive: tombstone anchors are never in edited/missing
      transacs.push({ _action: 'createOrUpdate', _id: lineId, ...rev.payload })
    }))
  }
  // out-of-band-inserted lines have no verified state: restoring means deleting them
  for (const lineId of compare.inserted) {
    transacs.push({ _action: 'delete', _id: lineId })
  }
  await rewriteLinesThroughPipeline(dataset, transacs, { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) })
  const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
  return await checkDataset(freshAfter as unknown as DatasetInternal)
}

// Shared by the explicit reindex action and _fix's projection-completion (A1 invariant): journal
// the index-divergence evidence BEFORE the reindex overwrites integrity.lastCheck.index, so what
// was served stays auditable after the repair destroys the live divergence (design: no silent
// auto-repair). Returns the reindex patch result (returnDocument:'after') so a caller that must
// re-check sees the pending, non-finalized doc.
const journalIndexRepairAndReindex = async (dataset: DatasetInternal, index: NonNullable<NonNullable<DatasetInternal['integrity']>['lastCheck']>['index'], reason?: string) => {
  await journals.log('datasets', dataset as any, {
    type: 'integrity-index-repair',
    data: JSON.stringify({
      reason,
      count: index?.count,
      diverged: index?.diverged,
      sample: index?.sample
    })
  } as any)
  return await datasetUtils.reindex(mongo.db, dataset as any)
}

// Repair for an 'index' breach: rebuild the projection from the verified source through the
// standard reindex path.
export const reindexForIntegrity = async (dataset: DatasetInternal, reason?: string): Promise<{ ok: true }> =>
  await withDatasetLock(dataset.id, () => reindexForIntegrityUnlocked(dataset, reason))

const reindexForIntegrityUnlocked = async (dataset: DatasetInternal, reason?: string): Promise<{ ok: true }> => {
  requireActive(dataset)
  await journalIndexRepairAndReindex(dataset, dataset.integrity?.lastCheck?.index, reason)
  return { ok: true }
}

// Acknowledge the trail anomalies the fresh check surfaces (round 3 §S1): the ack is itself a
// locked, reasoned ackTrail revision carrying the anomaly FINGERPRINTS — no mutable "dismissed"
// flag an adversary could set preemptively. The Mongo trailAck is only a pointer to it; the
// checker reads the fingerprints from the locked body. Fingerprints pin the exact version sets,
// so any later shadow/marker changes them and resurfaces despite the ack. A new ack merges the
// previous ack's fingerprints (only the latest ack is consulted).
export const ackTrailAnomalies = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> =>
  await withDatasetLock(dataset.id, () => ackTrailAnomaliesUnlocked(dataset, reason, who))

const ackTrailAnomaliesUnlocked = async (dataset: DatasetInternal, reason?: string, who?: WhoHint): Promise<Check> => {
  requireActive(dataset)
  const store = integrityStore()
  const before = await checkDataset(dataset)
  const anomalies = before.trail?.anomalies ?? []
  if (!anomalies.length) throw httpError(400, 'no trail anomalies to acknowledge')
  let fingerprints = anomalies.map(ops.anomalyFingerprint)
  const prevAck = dataset.integrity?.trailAck
  if (prevAck && Number.isInteger(prevAck.i)) {
    try {
      const prevRev = await store.getRevision(ops.revisionKey(dataset.owner, dataset.id, prevAck.i))
      if (prevRev.context.operation === 'ackTrail' && prevRev.ack?.fingerprints) {
        fingerprints = [...new Set([...prevRev.ack.fingerprints, ...fingerprints])]
      }
    } catch { /* unreadable previous ack: its anomalies resurface, which is the safe direction */ }
  }
  const i = await anchorDataset(dataset, { operation: 'ackTrail', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }, { force: true, ack: { fingerprints } })
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.trailAck': { i } }, $unset: { _needsHistorizing: '' } })
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  return await checkDataset(fresh as unknown as DatasetInternal)
}

export type RestoreResult = { status: 'restoring' } | Check

export const restoreRevision = async (app: any, dataset: DatasetInternal, i: number, reason: string | undefined, sessionState: SessionStateAuthenticated, locale: string, who?: WhoHint): Promise<RestoreResult> =>
  await withDatasetLock(dataset.id, () => restoreRevisionUnlocked(app, dataset, i, reason, sessionState, locale, who))

const restoreRevisionUnlocked = async (app: any, dataset: DatasetInternal, i: number, reason: string | undefined, sessionState: SessionStateAuthenticated, locale: string, who?: WhoHint): Promise<RestoreResult> => {
  requireActive(dataset)
  const store = integrityStore()
  const revision = await getRevisionOr404(ops.revisionKey(dataset.owner, dataset.id, i))
  if (!revision.payload) throw httpError(400, 'this revision has no payload (level-1 anchor): not restorable')

  // A restore routes its work through the standard pipeline (a file re-ingest, or a metadata
  // patch that can wake revalidation/reindex workers — M6): only a settled dataset is a safe
  // target, and the refusal comes BEFORE any write so a refused restore writes nothing.
  if (dataset.status !== 'finalized' && dataset.status !== 'error') {
    throw httpError(409, 'dataset is not in a stable state (finalized/error) for a restore')
  }

  // file part: the stored file's actual bytes vs the revision's file hash (metadata fields can lie)
  const currentFileHash = isFileDataset(dataset)
    ? await sha256OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err: any) => {
      if (err.status === 404) return undefined
      throw err
    })
    : undefined
  const needsFileRestore = !!(revision.payload.file && revision.hash.file !== currentFileHash)

  // metadata part: only the genuinely diverging covered keys
  const fresh = await mongo.datasets.findOne({ id: dataset.id })
  if (!fresh) throw httpError(404, 'dataset not found')
  const { $set, $unset } = ops.restoreUpdate(fresh, revision.payload.metadata)
  if ($set.topics) {
    const settings = await mongo.db.collection('settings').findOne({ type: dataset.owner.type, id: dataset.owner.id })
    $set.topics = ops.rehydrateTopics($set.topics, settings?.topics ?? [])
  }
  const restoreContext: HistorizeContextHint = { operation: 'restore', origin: 'superadmin', ...(reason ? { reason } : {}), ...(who ? { who } : {}) }

  if (!needsFileRestore) {
    // metadata-only restore: route the diverging keys through the standard patch pipeline (M6)
    // instead of a raw $set — a restored schema/extensions/rest change needs the same
    // revalidation, status triggers (reindex, line cleanup) and bookkeeping as a legitimate
    // patch. The restore context rides the patch's own outbox stamp (applyPatch defers to it,
    // finalize preserves it if a worker takes over).
    if (Object.keys($set).length || Object.keys($unset).length) {
      const patch: any = { _needsHistorizing: { context: restoreContext } }
      for (const key of Object.keys($set)) patch[key] = $set[key]
      for (const key of Object.keys($unset)) patch[key] = null
      const datasetClone: any = clone(fresh)
      const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(app, patch, datasetClone, sessionState, locale)
      if (!isEmpty) {
        await applyPatch(datasetClone, patch, removedRestProps, attemptMappingUpdate)
        // the patch woke a worker (revalidation/reindex): the pipeline re-anchors on finalize
        // with the preserved restore context — report async completion like the file branch
        if (patch.status) return { status: 'restoring' }
      }
    }
    // no worker woken: anchor synchronously with the restore context and respond with the
    // fresh verdict, like _fix. force: true — restore must always leave its own auditable
    // revision, even when the corrected state lands back on one identical to a prior anchor
    // (anchorDataset's normal dedupe would otherwise silently swallow the remediation)
    await anchorDataset(dataset, restoreContext, { force: true })
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
    const freshAfter = await mongo.datasets.findOne({ id: dataset.id })
    return await checkDataset(freshAfter as unknown as DatasetInternal)
  }

  // file restore: the raw metadata write stays (the re-ingest reprocesses everything downstream
  // through the draft pipeline, which revalidates what the metadata-only path routes through
  // preparePatch; and preparePatch below needs the healed doc — see the stale-clone note)
  if (Object.keys($set).length || Object.keys($unset).length) {
    const update: any = { $set: { ...$set, updatedAt: new Date().toISOString() } }
    if (Object.keys($unset).length) update.$unset = $unset
    await mongo.datasets.updateOne({ id: dataset.id }, update)
  }

  // re-ingest through the standard file-replacement path (spec §C): the payload lands in the
  // loading dir exactly as an upload would, preparePatch/applyPatch route it through the
  // draft pipeline, and finalize re-anchors with the restore context riding the draft
  const filename = revision.payload.metadata.originalFile?.name ?? dataset.originalFile?.name ?? 'restored-file'
  const destination = datasetUtils.loadingDir({ ...dataset, draftReason: true })
  const finalPath = path.join(destination, filename)
  // payload reference dedupe: the bytes may live under an earlier revision's `{i}.file`
  // (absent `file.i` = this revision owns them)
  const fileRefIndex = revision.payload.file?.i ?? i
  const { body } = await store.readPayload(ops.payloadKey(dataset.owner, dataset.id, fileRefIndex))
  // the platform-level originalFile.md5 descriptor is computed in-flight from the payload bytes
  // (the integrity hash is sha256 now, and metadata fields could have been tampered)
  const tee = md5Tee()
  body.on('error', (err: any) => tee.stream.destroy(err))
  await filesStorage.writeStream(body.pipe(tee.stream), finalPath)
  const stats = await filesStorage.fileStats(finalPath)
  // mime type is broken on windows it seems.. detect based on extension instead (mirrors upload.ts's fileFilter)
  const mimetype = mime.lookup(filename) || fallbackMimeTypes[filename.split('.').pop() as string] || filename.split('.').pop()
  const files = [{ fieldname: 'file', originalname: filename, filename, destination, path: finalPath, size: stats.size, md5: tee.digest(), mimetype }]

  const patch: any = { _needsHistorizing: { context: restoreContext } }
  // the metadata $set/$unset above may have just restored `file`/`originalFile` on the Mongo
  // doc (both are covered fields a metadata tamper can unset); preparePatch/applyPatch must
  // see that post-restore state, not the stale route-entry `dataset` — otherwise a healed
  // `file` still reads as absent on the clone and preparePatch's file-based guard throws 400
  // even though the metadata write already landed.
  const postMetadataDataset = await mongo.datasets.findOne({ id: dataset.id })
  if (!postMetadataDataset) throw httpError(404, 'dataset not found')
  const datasetClone: any = clone(postMetadataDataset)
  await preparePatch(app, patch, datasetClone, sessionState, locale, 'always', files)
  await applyPatch(datasetClone, patch)
  return { status: 'restoring' }
}

// ---------------------------------------------------------------------------------------------
// read side: revision listings, single-revision detail (diff data), payload access
// ---------------------------------------------------------------------------------------------

const pageSlice = (keys: string[], page: number, size: number): string[] =>
  keys.slice((page - 1) * size, (page - 1) * size + size)

export const listDatasetRevisions = async (dataset: DatasetInternal, page: number, size: number) => {
  requireActive(dataset)
  const store = integrityStore()
  // zero-padded indices sort lexically == numerically; newest first = reversed
  const keys = (await store.listRevisions(ops.revisionPrefix(dataset.owner, dataset.id), { delimiter: '/' })).map((r) => r.key)
    .filter((k) => !ops.isSiblingKey(k)).sort().reverse()
  const results = await Promise.all(pageSlice(keys, page, size).map(async (key) => {
    const i = ops.parseRevisionIndex(key)
    const [rev, who] = await Promise.all([store.getRevision(key), getWhoOrUndefined(ops.whoKey(dataset.owner, dataset.id, i))])
    return {
      i,
      hash: rev.hash,
      date: rev.context.date,
      operation: rev.context.operation,
      origin: rev.context.origin,
      ...(rev.context.reason ? { reason: rev.context.reason } : {}),
      hasPayload: !!rev.payload,
      ...(rev.payload?.file ? { fileSize: rev.payload.file.size } : {}),
      ...(who ? { who } : {})
    }
  }))
  return { count: keys.length, results }
}

export const getDatasetRevision = async (dataset: DatasetInternal, i: number) => {
  requireActive(dataset)
  const [rev, who, fresh] = await Promise.all([
    getRevisionOr404(ops.revisionKey(dataset.owner, dataset.id, i)),
    getWhoOrUndefined(ops.whoKey(dataset.owner, dataset.id, i)),
    mongo.datasets.findOne({ id: dataset.id })
  ])
  // `current` is the live covered projection so the UI can render the metadata diff in one call
  return { i, hash: rev.hash, context: rev.context, payload: rev.payload, ...(who ? { who } : {}), current: fresh ? ops.coveredMetadata(fresh) : undefined }
}

export const readRevisionFile = async (dataset: DatasetInternal, i: number) => {
  requireActive(dataset)
  const rev = await getRevisionOr404(ops.revisionKey(dataset.owner, dataset.id, i))
  if (!rev.payload?.file) throw httpError(404, 'this revision has no file payload')
  // payload reference dedupe: resolve the revision that owns the bytes (absent `file.i` = self)
  const refIndex = rev.payload.file.i ?? i
  const { body, size } = await integrityStore().readPayload(ops.payloadKey(dataset.owner, dataset.id, refIndex))
  return {
    body,
    size,
    filename: rev.payload.metadata.originalFile?.name ?? `${dataset.slug}-revision-${i}`,
    mimetype: rev.payload.metadata.originalFile?.mimetype ?? 'application/octet-stream'
  }
}

export const listLineRevisions = async (dataset: DatasetInternal, lineId: string, page: number, size: number) => {
  requireActive(dataset)
  if (!isRestDataset(dataset)) throw httpError(400, 'line revisions only apply to an editable (rest) dataset')
  const store = integrityStore()
  // `.who` siblings share the revision's prefix (target 8, design §4.2): exclude them here too,
  // the same sibling-awareness rule as the dataset-level listing above
  const keys = (await store.listRevisions(lops.lineRevisionPrefix(dataset.owner, dataset.id, lineId)))
    .map((r) => r.key).filter((k) => !ops.isSiblingKey(k)).sort().reverse()
  const results = await Promise.all(pageSlice(keys, page, size).map(async (key) => {
    const parsed = lops.parseLineRevisionKey(key)!
    const [rev, who] = await Promise.all([store.getRevision(key) as Promise<any>, getWhoOrUndefined(key + ops.WHO_SUFFIX)])
    return {
      i: parsed.i,
      ...(parsed.deleted ? { deleted: true } : { sha256: parsed.sha256 }),
      date: rev.context.date,
      operation: rev.context.operation,
      origin: rev.context.origin,
      ...(rev.context.reason ? { reason: rev.context.reason } : {}),
      hasPayload: !!rev.payload,
      ...(who ? { who } : {})
    }
  }))
  return { count: keys.length, results }
}

export const getLineRevision = async (dataset: DatasetInternal, lineId: string, i: number) => {
  requireActive(dataset)
  if (!isRestDataset(dataset)) throw httpError(400, 'line revisions only apply to an editable (rest) dataset')
  const store = integrityStore()
  // the key embeds the content hash, unknown to the caller: find it by its padded-index prefix
  const prefix = lops.lineRevisionPrefix(dataset.owner, dataset.id, lineId)
  // a `.who` sibling also starts with `${prefix}${paddedI}-` (it is the revision key + suffix):
  // exclude it explicitly rather than relying on listing order to keep the revision key first
  const keys = (await store.listRevisions(prefix)).map((r) => r.key).filter((k) => !ops.isSiblingKey(k))
  const key = keys.find((k) => k.startsWith(`${prefix}${lops.padLineIndex(i)}-`))
  if (!key) throw httpError(404, 'unknown revision')
  const [rev, who, currentLine]: [any, WhoBody | undefined, any] = await Promise.all([
    store.getRevision(key),
    getWhoOrUndefined(key + ops.WHO_SUFFIX),
    restUtils.collection(dataset).findOne({ _id: lineId })
  ])
  // symmetric with the payload: extension-owned columns are outside the covered body, so the
  // live projection shown against the snapshot excludes them too (no spurious diff)
  return { i, hash: rev.hash, context: rev.context, line: rev.line, payload: rev.payload, ...(who ? { who } : {}), current: currentLine ? lops.cleanedLineBody(currentLine, lops.extensionOwnedKeys(dataset.extensions)) : undefined }
}
