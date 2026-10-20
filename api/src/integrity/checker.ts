// api/src/integrity/checker.ts
import cron, { type ScheduledTask } from 'node-cron'
import Debug from 'debug'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import config from '#config'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import { isFileDataset, isRestDataset } from '#types/dataset/index.ts'
import { integrityStore } from './store-factory.ts'
import { purgeExpiredRevisions } from './purge.ts'
import { measureIntegrityStorage } from './storage.ts'
import { anchorDataset } from './relay.ts'
import { auditScopes } from './audit.ts'
import { maybeAlert } from './alerts.ts'
import * as ops from './operations.ts'
import * as lops from './lines-operations.ts'
import type { RevisionBody } from './store.ts'
import { sha256OfStorageFile } from './hash.ts'
import { checkIndexConsistency, type IndexCheckResult } from './index-check.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import * as restUtils from '../datasets/utils/rest.ts'

const debug = Debug('integrity-checker')
const BATCH = 100
const RENEW_CONCURRENCY = 100

export type TrailVerdict = { status: 'ok' | 'altered', anomalies?: ops.TrailAnomaly[] }

export type Check = {
  status: 'ok' | 'breach' | 'unknown'
  date?: string
  breach?: Array<'file' | 'metadata' | 'lines' | 'index'>
  lines?: { checked: number, diverged: number, sample: string[] }
  // verdict 3 (A1): the ES projection users actually read is consistent with the source
  index?: IndexCheckResult
  // verdict 2 (round 3): the trail itself is the one we wrote — absent on 'unknown' early returns
  trail?: TrailVerdict
}

// cap what is persisted on the dataset doc; the count of what was dropped goes in the last entry
const TRAIL_ANOMALY_CAP = 50

// Mongo side of the streamed compare (lines-operations.ts createLineComparer)
const liveLinesIO = (dataset: DatasetInternal): lops.LineCompareIO => {
  const c = restUtils.collection(dataset as any)
  return {
    lookupLive: async (ids) => await c.find({ _id: { $in: ids }, _deleted: { $ne: true } }).toArray() as lops.LiveLine[],
    countLive: async () => await c.countDocuments({ _deleted: { $ne: true } }),
    // checkDataset returns early when a pending stamp or relay hint exists at its start, so at
    // finish either can only come from a covered write that landed DURING the compare: the live
    // count is then untrustworthy and the comparer names inserts by scan instead.
    changedDuringCompare: async () => {
      if (await c.findOne({ _needsHistorizing: { $exists: true } }, { projection: { _id: 1 } })) return true
      const flags = await mongo.datasets.findOne({ id: dataset.id }, { projection: { _needsHistorizing: 1, _needsHistorizingLines: 1 } })
      return !!(flags?._needsHistorizing || flags?._needsHistorizingLines)
    },
    iterateLiveIds: async function * () {
      for await (const line of c.find({ _deleted: { $ne: true } }).project<{ _id: string, _i?: number }>({ _id: 1, _i: 1 })) yield line
    }
  }
}

const newComparer = (dataset: DatasetInternal, onDiverged: (batch: lops.LineDivergence[]) => Promise<void>) =>
  lops.createLineComparer(liveLinesIO(dataset), { excluded: lops.extensionOwnedKeys(dataset.extensions), onDiverged })

// Compare live Mongo lines against the latest anchors recovered from LIST alone (the sha256 is
// embedded in each key), streamed: memory is one lookup batch plus ~8 bytes per live line, never
// the whole anchor set. Repairs (fix/restore) walk the current view — they target data, not the
// trail — and act on each divergence batch as it is reported.
export const compareDatasetLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, onDiverged: (batch: lops.LineDivergence[]) => Promise<void>): Promise<lops.LineCompareResult> => {
  const comparer = newComparer(dataset, onDiverged)
  const fold = lops.newLineGroupFold()
  for await (const page of store.iterateRevisionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
    for (const group of lops.pushLineGroupKeys(fold, page)) await comparer.push(group)
  }
  for (const group of lops.finishLineGroupFold(fold)) await comparer.push(group)
  return await comparer.finish()
}

// the latest ackTrail revision's fingerprints, read from the LOCKED body (Mongo trailAck is only
// a pointer — a forged pointer to a non-ack revision yields nothing). Read BEFORE the walk so the
// collector filters acks before capping (design 2026-10-15 §3.4).
const readAckedFingerprints = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>): Promise<string[]> => {
  const trailAck = dataset.integrity?.trailAck
  if (!trailAck || !Number.isInteger(trailAck.i)) return []
  try {
    const ackRev = await store.getRevision(ops.revisionKey(dataset.owner, dataset.id, trailAck.i))
    if (ackRev.context.operation === 'ackTrail' && ackRev.ack?.fingerprints) return ackRev.ack.fingerprints
  } catch (err: any) {
    // a purged ack revision simply means no acks; anything else is worth logging
    if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) internalError('integrity-trail-ack-read', err)
  }
  return []
}

// Lock renewal by extension (architecture §3.4 Option B): when a passing check finds the current
// anchor is "old" (per ops.needsRenewal), push its compliance retain-until forward in place so the
// current state stays protected indefinitely. Failure is surfaced loudly, never thrown — the anchor
// stays valid until its existing retain-until, leaving lead time to react.
const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, latestKey: string, latestRevision: RevisionBody): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal(dataset.integrity?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  try {
    await store.extendRetention(latestKey, retainUntil)
    // the sliding anchor is the revision *pair*: the latest revision JSON and the payload object it
    // references. A level-2 anchor's repairability dies with its payload's lock, so the referenced
    // .file must slide forward too — which may be an earlier revision's copy (payload reference
    // dedupe): resolve `file.i`, or, absent, the latest revision owns its own bytes.
    if (latestRevision.payload?.file) {
      const refIndex = latestRevision.payload.file.i ?? ops.parseRevisionIndex(latestKey)
      await store.extendRetention(ops.payloadKey(dataset.owner, dataset.id, refIndex), retainUntil)
    }
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: {
        'integrity.lastRevision.retainUntil': retainUntil.toISOString(),
        'integrity.lastRenewal': { date, status: 'ok', retainUntil: retainUntil.toISOString() }
      }
    })
    await maybeAlert(dataset, 'integrity-renewal-failed', false, 'renewal-failed')
  } catch (err) {
    internalError('integrity-renew', err)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: { 'integrity.lastRenewal': { date, status: 'failed', error: err instanceof Error ? err.message : String(err) } }
    })
    // a failed renewal left un-reacted-to is the one silent path to permanently lost
    // repairability (the anchor's lock lapses while the resource is still live): same loudness
    // and realert cadence as a breach (§S3)
    await maybeAlert(dataset, 'integrity-renewal-failed', true, 'renewal-failed')
  }
}

// The lines versions walk shared by lines renewal and _fix's re-anchoring of unclean keys (one
// implementation, so the two cannot disagree on which key is a line's latest or whether it is
// clean): each line's latest anchor group, with `clean` read from that key's own versions in the
// current view. Anomalies are not collected here (the check's own walk does that).
export const iterateLineAnchorGroupsWithVersions = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, onGroups: (groups: lops.LineAnchorGroup[]) => Promise<void>): Promise<void> => {
  const acc = ops.newTrailFold(() => {})
  const fold = lops.newLineGroupFold()
  for await (const page of store.iterateVersionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
    ops.foldTrailVersions(acc, page)
    await onGroups(lops.pushLineGroupKeys(fold, [...acc.current.values()]))
    acc.current.clear()
  }
  ops.finishTrailFold(acc)
  await onGroups(lops.pushLineGroupKeys(fold, [...acc.current.values()]))
  await onGroups(lops.finishLineGroupFold(fold))
}

// lineIds whose latest anchor is not a tombstone and whose key's versions are unclean (shadow
// version / delete marker): exactly the keys maybeRenewLines refuses to renew. O(unclean) memory.
export const uncleanLatestLineIds = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>): Promise<string[]> => {
  const ids: string[] = []
  await iterateLineAnchorGroupsWithVersions(dataset, store, async (groups) => {
    for (const group of groups) if (!group.deleted && !group.clean) ids.push(group.lineId)
  })
  return ids
}

// Per-line lock renewal (target 3), streamed (design 2026-10-15 §3.5): runs only after a fully
// clean check, then walks the lines versions itself and extends each line's latest live anchor —
// ONLY if that key's own versions are clean. PutObjectRetention carries no version id: a shadow
// version slipped in after the check would otherwise get the attacker's version extended. An
// unclean key counts as a failure (loud) until _fix re-anchors that line past it (a fresh, clean
// latest key — service.ts). Exhaustive by necessity (§3.5); tombstones age out.
const maybeRenewLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal(dataset.integrity?.linesRenewal?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  let renewed = 0
  let failed = 0
  let queue: lops.LineAnchorGroup[] = []
  const renewQueue = async () => {
    await Promise.all(queue.map(async (anchor) => {
      try {
        await store.extendRetention(anchor.key, retainUntil)
        renewed++
      } catch (err) {
        internalError('integrity-renew-lines', err)
        failed++
      }
    }))
    queue = []
  }
  const take = async (groups: lops.LineAnchorGroup[]) => {
    for (const group of groups) {
      if (group.deleted) continue
      if (!group.clean) {
        internalError('integrity-renew-lines', new Error(`refusing to renew tampered key ${group.key}`))
        failed++
        continue
      }
      queue.push(group)
      if (queue.length >= RENEW_CONCURRENCY) await renewQueue()
    }
  }
  await iterateLineAnchorGroupsWithVersions(dataset, store, take)
  await renewQueue()
  // set the subfields individually: a failure must KEEP the previous retainUntil. Replacing the
  // whole subdocument would drop it, needsRenewal(undefined) is false, and renewal would go quiet
  // forever (never retried, alert never re-fired) while the locks silently lapse. Only a full
  // success advances the horizon.
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: {
      'integrity.linesRenewal.date': date,
      'integrity.linesRenewal.status': failed ? 'failed' : 'ok',
      'integrity.linesRenewal.renewed': renewed,
      'integrity.linesRenewal.failed': failed,
      ...(failed ? {} : { 'integrity.linesRenewal.retainUntil': retainUntil.toISOString() })
    }
  })
  // same posture as the dataset-level renewal, separate dedup cadence (see alerts.ts)
  await maybeAlert(dataset, 'integrity-renewal-failed', failed > 0, 'lines-renewal-failed')
}

export const checkDataset = async (dataset: DatasetInternal, opts?: { deep?: boolean, seed?: string }): Promise<Check> => {
  const startedAt = Date.now()
  let peakHeap = 0 // sampled while draining line keys: the streamed compare must keep it flat
  // a relay is pending: the hot state legitimately differs from the latest anchor until the relay
  // writes the new revision — checking now would raise a false breach alert
  if (dataset._needsHistorizing || dataset._needsHistorizingLines) return { status: 'unknown' }
  // an 'unknown' verdict must still start the check-stale clocks (§S3) on datasets enrolled
  // before the fields existed — otherwise a permanently-unknown dataset never trips the alert.
  // Both clocks are seeded: the index clock has its own stale sweep (a pinned-unknown index
  // verdict leaves the overall clock advancing, see the final $set below).
  const seedDefinitive = (date: string): Record<string, string> => ({
    ...(dataset.integrity?.lastDefinitiveCheck ? {} : { 'integrity.lastDefinitiveCheck': date }),
    ...(dataset.integrity?.lastDefinitiveIndexCheck ? {} : { 'integrity.lastDefinitiveIndexCheck': date })
  })
  if (isRestDataset(dataset as any)) {
    // orphaned per-line stamps: a line write that raced the relay's final hint clear left stamps
    // with no hint — the relay's task filter needs the hint, so without this net those lines
    // would never drain and would read as a false 'edited' breach here. Re-set the hint (the
    // relay drains them on its next pass) and report unknown, date persisted so the sweep
    // cursor advances.
    const stamped = await restUtils.collection(dataset as any).findOne({ _needsHistorizing: { $exists: true } }, { projection: { _id: 1 } })
    if (stamped) {
      const date = new Date().toISOString()
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true, 'integrity.lastCheck': { date, status: 'unknown' }, ...seedDefinitive(date) } })
      return { status: 'unknown', date }
    }
  }
  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const linesPrefix = lops.linesPrefix(dataset.owner, dataset.id)

  // ONE versions walk over the whole scope serves both verdicts: it reconstructs the current
  // view (marker-hidden keys resurface into the data compare) and yields the trail anomalies
  // the current view cannot show (shadow versions, markers). Line keys are grouped per lineId as
  // they stream and compared in batches (design 2026-10-15): memory no longer grows with the
  // number of lines. Anomalies are ack-filtered as produced, then capped.
  const collector = ops.newAnomalyCollector(await readAckedFingerprints(dataset, store), TRAIL_ANOMALY_CAP)
  const datasetAcc = ops.newTrailFold(collector.push)
  const linesAcc = ops.newTrailFold(collector.push)
  const groupFold = lops.newLineGroupFold()
  const linesSample: string[] = []
  const comparer = isRestDataset(dataset as any)
    ? newComparer(dataset, async (batch) => { for (const d of batch) if (linesSample.length < 20) linesSample.push(d.lineId) })
    : undefined
  const drainLineKeys = async (groups: lops.LineAnchorGroup[]) => {
    if (comparer) for (const group of groups) await comparer.push(group)
  }
  const drainCurrentLineKeys = async () => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
    if (!linesAcc.current.size) return
    const groups = lops.pushLineGroupKeys(groupFold, [...linesAcc.current.values()])
    linesAcc.current.clear()
    await drainLineKeys(groups)
  }
  for await (const page of store.iterateVersionPages(prefix)) {
    const datasetEntries: ops.TrailVersionEntry[] = []
    const lineEntries: ops.TrailVersionEntry[] = []
    for (const entry of page) (entry.key.startsWith(linesPrefix) ? lineEntries : datasetEntries).push(entry)
    if (datasetEntries.length) ops.foldTrailVersions(datasetAcc, datasetEntries)
    if (lineEntries.length) { ops.foldTrailVersions(linesAcc, lineEntries); await drainCurrentLineKeys() }
  }
  const datasetView = ops.finishTrailFold(datasetAcc)
  ops.finishTrailFold(linesAcc)
  await drainCurrentLineKeys()
  await drainLineKeys(lops.finishLineGroupFold(groupFold))

  const datasetKeys = [...datasetView.current.keys()]
  const latest = ops.latestKey(datasetKeys)
  if (!latest) {
    // no anchor written yet (e.g. enable succeeded — integrity.active is set — but the inline
    // anchor write then failed, S3 down, before any revision landed): persist the verdict so a
    // stale 'ok' cannot linger and the sweep cursor (sorted on lastCheck.date) advances past this
    // dataset
    const date = new Date().toISOString()
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' }, ...seedDefinitive(date) } })
    return { status: 'unknown', date }
  }

  const latestRevision = await store.getRevision(latest)
  if (latestRevision.context.operation === 'disable' || latestRevision.context.operation === 'delete') {
    // crash residue of a terminal action (revision written, Mongo flip never landed — the
    // benign direction of §S2's revision-first ordering): the dataset is still active, so
    // force-anchor a fresh non-terminal revision and report unknown; the next pass verifies
    await anchorDataset(dataset, { operation: 'update', origin: 'worker' }, { force: true })
    const date = new Date().toISOString()
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' }, ...seedDefinitive(date) } })
    return { status: 'unknown', date }
  }

  // trail verdict: sequence gaps + date skew (incremental — only revisions the trail check has
  // not yet date-verified; `deep` re-verifies the whole window) + ack filtering
  const seqIndexes = datasetKeys.filter((k) => !ops.isSiblingKey(k)).map(ops.parseRevisionIndex)
  for (const a of ops.sequenceGapAnomalies(prefix, seqIndexes)) collector.push(a)
  const skewToleranceMs = (config.integrity?.trail?.dateSkewHours ?? 48) * 3600 * 1000
  const latestIndex = ops.parseRevisionIndex(latest)
  const latestSkew = ops.dateSkewAnomaly(latest, latestRevision.context.date, datasetView.current.get(latest)?.lastModified, skewToleranceMs)
  if (latestSkew) collector.push(latestSkew)
  const trailCursor = opts?.deep ? -1 : (dataset.integrity?.lastCheck?.trailCursor ?? -1)
  for (const i of seqIndexes.filter((n) => n > trailCursor && n !== latestIndex).sort((a, b) => a - b)) {
    const key = ops.revisionKey(dataset.owner, dataset.id, i)
    try {
      const rev = await store.getRevision(key)
      const skew = ops.dateSkewAnomaly(key, rev.context.date, datasetView.current.get(key)?.lastModified, skewToleranceMs)
      if (skew) collector.push(skew)
    } catch (err) {
      internalError('integrity-trail-read', err) // unreadable mid-purge revision: skip, not an anomaly
    }
  }
  const trail: TrailVerdict = collector.total()
    ? { status: 'altered', anomalies: collector.kept }
    : { status: 'ok' }

  const expected = latestRevision.hash
  const breach: Array<'file' | 'metadata' | 'lines' | 'index'> = []
  // a missing file is the strongest tamper signal (deleted out-of-band) → breach, not an exception
  const actualFileHash = isFileDataset(dataset)
    ? await sha256OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      if (err.status === 404) return undefined
      throw err
    })
    : undefined
  if (expected.file !== actualFileHash) breach.push('file')
  // hash the live doc, freshly re-read (the caller's copy may be a cleaned/projected response doc)
  const freshDoc = await mongo.datasets.findOne({ id: dataset.id })
  if (!freshDoc || ops.metadataHash(freshDoc) !== expected.metadata) breach.push('metadata')
  if (freshDoc?.integrity?.active && !freshDoc.integrity.lastRevision) {
    // externally lost lastRevision mirror: the renewal gate (needsRenewal(undefined) === false)
    // would silently stop sliding the anchor's lock — heal it from the store, the authoritative
    // source, and patch the in-memory doc so this very pass can renew if due
    const retainUntil = await store.getRetention(latest)
    const lastRevision = { i: ops.parseRevisionIndex(latest), hash: latestRevision.hash, date: latestRevision.context.date, retainUntil: retainUntil?.toISOString() }
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastRevision': lastRevision } })
    dataset.integrity!.lastRevision = lastRevision
  }

  let linesResult: { checked: number, diverged: number, sample: string[] } | undefined
  if (comparer) {
    const linesCompare = await comparer.finish()
    if (linesCompare.diverged) breach.push('lines')
    linesResult = { checked: linesCompare.checked, diverged: linesCompare.diverged, sample: linesSample }
  }

  // verdict 3 (A1): the projection users actually read. ES unavailability degrades to
  // 'unknown' (fail-open on availability — check-stale bounds accumulation), never a crash
  // that would abort the whole check.
  // A file dataset whose stored file is gone has no source to compare the index against: the
  // file verdict above already carries the breach. Reading it anyway would go through the
  // indexer's readStreams, which sleeps 10s on a missing file before failing.
  let indexResult: IndexCheckResult
  if (isFileDataset(dataset) && actualFileHash === undefined) {
    indexResult = { status: 'unknown' }
  } else {
    try {
      indexResult = await checkIndexConsistency(dataset, { deep: opts?.deep, seed: opts?.seed })
    } catch (err) {
      internalError('integrity-index-check', err)
      indexResult = { status: 'unknown' }
    }
  }
  if (indexResult.status === 'diverged') breach.push('index')

  if (breach.length) {
    // a legitimate stamped write may have landed while this (potentially long) scan ran: the
    // compare then saw new content against the old anchor. The relay cannot have drained the
    // stamp mid-check (relays run under the per-dataset worker lock, held around this check by
    // the sweep and the admin actions), so a mid-check write is still visible as a pending flag
    // here — report unknown instead of recording and notifying a false breach.
    const flagsNow = await mongo.datasets.findOne({ id: dataset.id }, { projection: { _needsHistorizing: 1, _needsHistorizingLines: 1 } })
    if (flagsNow?._needsHistorizing || flagsNow?._needsHistorizingLines) {
      const date = new Date().toISOString()
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' }, ...seedDefinitive(date) } })
      return { status: 'unknown', date }
    }
  }

  const status: 'ok' | 'breach' = breach.length ? 'breach' : 'ok'
  // the index member is the only verdict that can be individually 'unknown' while the overall
  // check stays definitive (ES down, pending _needsIndexing, forged non-finalized status — all
  // outside hash coverage), so it carries its own freshness clock: without it a Mongo-writing
  // adversary could pin the index verdict to 'unknown' forever without tripping check-stale
  const definitiveIndex = indexResult.status !== 'unknown'
  const date = new Date().toISOString()
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: {
      'integrity.lastCheck': { date, status, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}), trail, index: indexResult, trailCursor: latestIndex },
      // ok and breach are both DEFINITIVE verdicts: they reset the check-stale clocks (§S3) —
      // only 'unknown' lets them run. The index clock only ever advances here, alongside the
      // overall one, so lastDefinitiveIndexCheck <= lastDefinitiveCheck always holds (the stale
      // sweep's dedup split relies on this ordering). A non-definitive index still seeds an
      // absent clock (pre-field enrollments) so the pin cannot stay silent forever.
      'integrity.lastDefinitiveCheck': date,
      ...(definitiveIndex || !dataset.integrity?.lastDefinitiveIndexCheck ? { 'integrity.lastDefinitiveIndexCheck': date } : {})
    }
  })
  // entry-alert + periodic re-alert while the state persists, dedup cleared on recovery (§S3)
  await maybeAlert(dataset, 'integrity-breach', status === 'breach')
  await maybeAlert(dataset, 'integrity-trail-altered', trail.status === 'altered')
  await maybeAlert(dataset, 'integrity-check-stale', false)
  // the index-stale dedup clears only on a definitive index pass — a pass that leaves the index
  // verdict pinned must not reset the re-alert cadence
  if (definitiveIndex) await maybeAlert(dataset, 'integrity-check-stale', false, 'index-check-stale')
  // renewal only on a fully clean pass: under a shadow attack PutObjectRetention (keyed, no
  // version id) would extend the ATTACKER's current version while the original's lock runs out
  if (status === 'ok' && trail.status === 'ok') {
    await maybeRenew(dataset, store, latest, latestRevision)
    if (isRestDataset(dataset as any)) await maybeRenewLines(dataset, store)
  }
  debug('check done', { datasetId: dataset.id, durationMs: Date.now() - startedAt, lines: linesResult?.checked, peakHeapMB: Math.round(peakHeap / 1e6) })
  return { status, date, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}), trail, index: indexResult }
}

// Check-stale alert (§S3): a dataset that is enrolled but has produced no DEFINITIVE verdict
// (ok or breach) for maxUnknownDays — wedged stamps, stuck pipeline, lock contention, S3 outage,
// or an adversary keeping flags set — must not stay silent: the whole round-2 posture of
// "downgrade to unknown" is only safe if unknowns cannot silently accumulate.
export const alertStaleChecks = async (): Promise<{ alerted: string[] }> => {
  const maxUnknownDays = config.integrity?.maxUnknownDays ?? 7
  const cutoff = new Date(Date.now() - maxUnknownDays * 24 * 3600 * 1000).toISOString()
  const alerted: string[] = []
  const cursor = mongo.datasets.find({ 'integrity.active': true, 'integrity.lastDefinitiveCheck': { $lt: cutoff } }).limit(BATCH)
  for await (const dataset of cursor) {
    try {
      if (await maybeAlert(dataset as DatasetInternal, 'integrity-check-stale', true)) alerted.push(dataset.id)
    } catch (err) {
      internalError('integrity-check-stale', err)
    }
  }
  // per-verdict clock (index): the pinned-index shape — index clock stale while the overall
  // clock is fresh. The conjunct excludes datasets the loop above already alerted (sound because
  // the index clock only advances alongside the overall one, so overall-stale implies
  // index-stale); the distinct dedup key keeps the two cadences independent (same
  // two-sources-one-event pattern as integrity-renewal-failed).
  const indexCursor = mongo.datasets.find({
    'integrity.active': true,
    'integrity.lastDefinitiveIndexCheck': { $lt: cutoff },
    'integrity.lastDefinitiveCheck': { $gte: cutoff }
  }).limit(BATCH)
  for await (const dataset of indexCursor) {
    try {
      if (await maybeAlert(dataset as DatasetInternal, 'integrity-check-stale', true, 'index-check-stale')) alerted.push(dataset.id)
    } catch (err) {
      internalError('integrity-check-stale', err)
    }
  }
  return { alerted }
}

const runOnce = async () => {
  // pre-exclude BOTH pending-relay markers (M3): checkDataset would return 'unknown' without
  // persisting lastCheck.date, so a hinted dataset would keep sorting first and waste a sweep
  // slot every night until its relay drains
  const cursor = mongo.datasets
    .find({ 'integrity.active': true, _needsHistorizing: { $exists: false }, _needsHistorizingLines: { $exists: false } })
    .sort({ 'integrity.lastCheck.date': 1 })
    .limit(BATCH)
  for await (const dataset of cursor) {
    // the standard per-dataset worker lock: without it a relay (or a synchronous admin anchor,
    // which holds the same lock) could write a new anchor mid-check and turn the stale compare
    // into a false breach. Skip a busy dataset — its lastCheck.date stays old, so it sorts
    // first on the next pass.
    const ack = await locks.acquire(`datasets:${dataset.id}`, 'integrity-checker')
    if (!ack) { debug('dataset busy (worker/admin lock held), skipping check', dataset.id); continue }
    try { await checkDataset(dataset as DatasetInternal) } catch (err) { internalError('integrity-check-dataset', err) } finally { await locks.release(`datasets:${dataset.id}`) }
  }
}

let stopped = false
let taskPromise: Promise<void> | undefined
let scheduledTask: ScheduledTask | undefined

export const task = async () => {
  if (stopped) return
  try {
    const ack = await locks.acquire('integrity-check-task')
    if (!ack) { debug('another pod holds the integrity-check lock, skipping'); return }
    try {
      await runOnce()
      // aging-out of expired revisions rides the same daily lock-held pass (see purge.ts):
      // never thrown — a failed purge only delays reclamation, not protection
      if (config.integrity?.active) {
        let reclaimedMarkers: Record<string, number> = {}
        try {
          const purged = await purgeExpiredRevisions(integrityStore())
          reclaimedMarkers = purged.markerScopes
          debug('purged expired revisions', purged)
        } catch (err) {
          internalError('integrity-purge-run', err)
        }
        // storage accounting rides the same daily pass, after the purge so freshly reclaimed
        // bytes stop counting immediately (see integrity/storage.ts)
        try {
          const measured = await measureIntegrityStorage(integrityStore())
          debug('measured integrity storage', measured)
        } catch (err) {
          internalError('integrity-storage-run', err)
        }
        // store-vs-Mongo scope audit (round 3 §S2): the store is the authority on what should
        // be protected — an out-of-band `integrity.active` flip cannot silence it
        try {
          const audited = await auditScopes(integrityStore(), { reclaimedMarkers })
          debug('audited scopes', audited)
        } catch (err) {
          internalError('integrity-audit-run', err)
        }
        // check-stale alert (§S3): unknowns must not silently accumulate
        try {
          const stale = await alertStaleChecks()
          debug('stale-check alerts', stale)
        } catch (err) {
          internalError('integrity-stale-run', err)
        }
      }
    } finally { await locks.release('integrity-check-task') }
  } catch (err) {
    internalError('integrity-check-cron', err)
  }
}

export const start = () => {
  scheduledTask = cron.schedule(config.integrityCheckCron ?? '0 4 * * *', () => {
    if (taskPromise) return
    taskPromise = task()
    taskPromise.finally(() => { taskPromise = undefined })
  })
}

export const stop = async () => {
  stopped = true
  scheduledTask?.stop()
  if (taskPromise) await taskPromise
}
