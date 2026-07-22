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
import * as ops from './operations.ts'
import * as lops from './lines-operations.ts'
import type { RevisionBody } from './store.ts'
import { sha256OfStorageFile } from './hash.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import * as notifications from '../misc/utils/notifications.ts'

const debug = Debug('integrity-checker')
const BATCH = 100
const RENEW_CONCURRENCY = 100

export type TrailVerdict = { status: 'ok' | 'altered', anomalies?: ops.TrailAnomaly[] }

export type Check = {
  status: 'ok' | 'breach' | 'unknown'
  date?: string
  breach?: Array<'file' | 'metadata' | 'lines'>
  lines?: { checked: number, diverged: number, sample: string[] }
  // verdict 2 (round 3): the trail itself is the one we wrote — absent on 'unknown' early returns
  trail?: TrailVerdict
}

// cap what is persisted on the dataset doc; the count of what was dropped goes in the last entry
const TRAIL_ANOMALY_CAP = 50

// Compare live Mongo lines against the latest anchors recovered from LIST alone (the sha256 is
// embedded in each key). Returns the three divergence shapes plus the anchor map (restore/fix
// need the keys to fetch payloads / write tombstones). `preAnchors` lets checkDataset inject the
// anchors folded from its own versions walk (marker-hidden keys resurfaced) — fix/restore call
// without it and walk the current view themselves (repair targets data, not the trail).
export const compareDatasetLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, preAnchors?: Map<string, lops.LatestLineAnchor>) => {
  // fold LIST pages incrementally: the prefix holds every revision within the retention window,
  // but only the latest anchor per line is kept in memory (O(distinct lines in window))
  const anchors = preAnchors ?? new Map<string, lops.LatestLineAnchor>()
  if (!preAnchors) {
    for await (const page of store.iterateRevisionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
      lops.foldLatestLineAnchors(anchors, page.map((r) => r.key))
    }
  }
  const unvisited = new Set(anchors.keys())
  const edited: string[] = []
  const inserted: string[] = []
  let checked = 0
  // must mirror the relay: extension-owned columns are outside the covered body
  const excluded = lops.extensionOwnedKeys(dataset.extensions)
  const c = restUtils.collection(dataset as any)
  for await (const line of c.find({ _deleted: { $ne: true } })) {
    checked++
    unvisited.delete(line._id)
    const verdict = lops.classifyLine(line, anchors.get(line._id), excluded)
    if (verdict === 'edited') edited.push(line._id)
    else if (verdict === 'inserted') inserted.push(line._id)
    if (checked % 1000 === 0) await new Promise(resolve => setImmediate(resolve))
  }
  // anchors never visited by a live line: out-of-band deletes (unless their latest is a tombstone)
  const missing = [...unvisited].filter((lineId) => !anchors.get(lineId)!.deleted)
  return { checked, edited, inserted, missing, anchors }
}

// Lock renewal by extension (architecture §3.4 Option B): when a passing check finds the current
// anchor is "old" (per ops.needsRenewal), push its compliance retain-until forward in place so the
// current state stays protected indefinitely. Failure is surfaced loudly, never thrown — the anchor
// stays valid until its existing retain-until, leaving lead time to react.
const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, latestKey: string, latestRevision: RevisionBody): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal((dataset.integrity as any)?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  const wasFailed = (dataset.integrity as any)?.lastRenewal?.status === 'failed'
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
  } catch (err) {
    internalError('integrity-renew', err)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: { 'integrity.lastRenewal': { date, status: 'failed', error: err instanceof Error ? err.message : String(err) } }
    })
    // a failed renewal left un-reacted-to is the one silent path to permanently lost
    // repairability (the anchor's lock lapses while the resource is still live): surface it
    // through the same events path as a breach, gated on the ok→failed transition like the
    // breach notification (renewal retries nightly until it succeeds — no daily re-alert)
    if (!wasFailed) {
      await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-renewal-failed')
    }
  }
}

// Per-line lock renewal (target 3): when the dataset's lines-renewal horizon is due and the
// check passed, extend every live latest anchor in one pass. Exhaustive by necessity (§3.5):
// a missed renewal permanently loses that line's repairability at lock expiry. Tombstone
// anchors are deliberately skipped — a deleted line's history ages out.
const maybeRenewLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, anchors: Map<string, lops.LatestLineAnchor>): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal((dataset.integrity as any)?.linesRenewal?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  let renewed = 0
  let failed = 0
  // one PutObjectRetention per live line is unavoidable (exhaustive by design), but serializing
  // them is not: batch-concurrent like the relay, so a gate-sized dataset renews in minutes not hours
  const live = [...anchors.values()].filter((anchor) => !anchor.deleted)
  for (let offset = 0; offset < live.length; offset += RENEW_CONCURRENCY) {
    await Promise.all(live.slice(offset, offset + RENEW_CONCURRENCY).map(async (anchor) => {
      try {
        await store.extendRetention(anchor.key, retainUntil)
        renewed++
      } catch (err) {
        internalError('integrity-renew-lines', err)
        failed++
      }
    }))
  }
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.linesRenewal': { date, status: failed ? 'failed' : 'ok', renewed, failed, ...(failed ? {} : { retainUntil: retainUntil.toISOString() }) } }
  })
  // same posture as the dataset-level renewal: alert on the ok→failed transition (see maybeRenew)
  if (failed && (dataset.integrity as any)?.linesRenewal?.status !== 'failed') {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-renewal-failed')
  }
}

export const checkDataset = async (dataset: DatasetInternal, opts?: { deep?: boolean }): Promise<Check> => {
  // a relay is pending: the hot state legitimately differs from the latest anchor until the relay
  // writes the new revision — checking now would raise a false breach alert
  if (dataset._needsHistorizing || dataset._needsHistorizingLines) return { status: 'unknown' }
  if (isRestDataset(dataset as any)) {
    // orphaned per-line stamps: a line write that raced the relay's final hint clear left stamps
    // with no hint — the relay's task filter needs the hint, so without this net those lines
    // would never drain and would read as a false 'edited' breach here. Re-set the hint (the
    // relay drains them on its next pass) and report unknown, date persisted so the sweep
    // cursor advances.
    const stamped = await restUtils.collection(dataset as any).findOne({ _needsHistorizing: { $exists: true } }, { projection: { _id: 1 } })
    if (stamped) {
      const date = new Date().toISOString()
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { _needsHistorizingLines: true, 'integrity.lastCheck': { date, status: 'unknown' } } })
      return { status: 'unknown', date }
    }
  }
  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const linesPrefix = lops.linesPrefix(dataset.owner, dataset.id)

  // ONE versions walk over the whole scope serves both verdicts: it reconstructs the current
  // view (marker-hidden keys resurface into the data compare) and yields the trail anomalies
  // the current view cannot show (shadow versions, markers). Line keys are folded into the
  // latest-anchor map page by page and dropped, so memory stays O(distinct lines in window).
  const datasetAcc = ops.newTrailFold()
  const linesAcc = ops.newTrailFold()
  const lineAnchors = new Map<string, lops.LatestLineAnchor>()
  const drainLineKeys = () => {
    if (!linesAcc.current.size) return
    lops.foldLatestLineAnchors(lineAnchors, [...linesAcc.current.keys()])
    linesAcc.current.clear()
  }
  for await (const page of store.iterateVersionPages(prefix)) {
    const datasetEntries: ops.TrailVersionEntry[] = []
    const lineEntries: ops.TrailVersionEntry[] = []
    for (const entry of page) (entry.key.startsWith(linesPrefix) ? lineEntries : datasetEntries).push(entry)
    if (datasetEntries.length) ops.foldTrailVersions(datasetAcc, datasetEntries)
    if (lineEntries.length) { ops.foldTrailVersions(linesAcc, lineEntries); drainLineKeys() }
  }
  const datasetView = ops.finishTrailFold(datasetAcc)
  const linesView = ops.finishTrailFold(linesAcc)
  drainLineKeys()
  const trailAnomalies = [...datasetView.anomalies, ...linesView.anomalies]

  const datasetKeys = [...datasetView.current.keys()]
  const latest = ops.latestKey(datasetKeys)
  if (!latest) {
    // no anchor written yet (e.g. enable succeeded — integrity.active is set — but the inline
    // anchor write then failed, S3 down, before any revision landed): persist the verdict so a
    // stale 'ok' cannot linger and the sweep cursor (sorted on lastCheck.date) advances past this
    // dataset
    const date = new Date().toISOString()
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' } } })
    return { status: 'unknown', date }
  }

  const latestRevision = await store.getRevision(latest)

  // trail verdict: sequence gaps + date skew (incremental — only revisions the trail check has
  // not yet date-verified; `deep` re-verifies the whole window) + ack filtering
  const seqIndexes = datasetKeys.filter((k) => !ops.isPayloadKey(k)).map(ops.parseRevisionIndex)
  trailAnomalies.push(...ops.sequenceGapAnomalies(prefix, seqIndexes))
  const skewToleranceMs = (config.integrity?.trail?.dateSkewHours ?? 48) * 3600 * 1000
  const latestIndex = ops.parseRevisionIndex(latest)
  const latestSkew = ops.dateSkewAnomaly(latest, latestRevision.context.date, datasetView.current.get(latest)?.lastModified, skewToleranceMs)
  if (latestSkew) trailAnomalies.push(latestSkew)
  const trailCursor = opts?.deep ? -1 : ((dataset.integrity as any)?.lastCheck?.trailCursor ?? -1)
  for (const i of seqIndexes.filter((n) => n > trailCursor && n !== latestIndex).sort((a, b) => a - b)) {
    const key = ops.revisionKey(dataset.owner, dataset.id, i)
    try {
      const rev = await store.getRevision(key)
      const skew = ops.dateSkewAnomaly(key, rev.context.date, datasetView.current.get(key)?.lastModified, skewToleranceMs)
      if (skew) trailAnomalies.push(skew)
    } catch (err) {
      internalError('integrity-trail-read', err) // unreadable mid-purge revision: skip, not an anomaly
    }
  }
  let anomalies = trailAnomalies
  const trailAck = (dataset.integrity as any)?.trailAck
  if (anomalies.length && Number.isInteger(trailAck?.i)) {
    // the Mongo pointer is a hint: authority is the locked ackTrail revision body itself — a
    // forged pointer to a non-ack revision verifies false and filters nothing
    try {
      const ackRev = await store.getRevision(ops.revisionKey(dataset.owner, dataset.id, trailAck.i))
      if (ackRev.context.operation === 'ackTrail' && ackRev.ack?.fingerprints) {
        anomalies = ops.filterAckedAnomalies(anomalies, ackRev.ack.fingerprints)
      }
    } catch (err) {
      internalError('integrity-trail-ack-read', err)
    }
  }
  const trail: TrailVerdict = anomalies.length
    ? { status: 'altered', anomalies: anomalies.slice(0, TRAIL_ANOMALY_CAP) }
    : { status: 'ok' }

  const expected = latestRevision.hash
  const breach: Array<'file' | 'metadata' | 'lines'> = []
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
  if (freshDoc?.integrity?.active && !(freshDoc.integrity as any).lastRevision) {
    // externally lost lastRevision mirror: the renewal gate (needsRenewal(undefined) === false)
    // would silently stop sliding the anchor's lock — heal it from the store, the authoritative
    // source, and patch the in-memory doc so this very pass can renew if due
    const retainUntil = await store.getRetention(latest)
    const lastRevision = { i: ops.parseRevisionIndex(latest), hash: latestRevision.hash, date: latestRevision.context.date, retainUntil: retainUntil?.toISOString() }
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastRevision': lastRevision } })
    ;(dataset.integrity as any).lastRevision = lastRevision
  }

  let linesResult: { checked: number, diverged: number, sample: string[] } | undefined
  let linesCompare: Awaited<ReturnType<typeof compareDatasetLines>> | undefined
  if (isRestDataset(dataset as any)) {
    linesCompare = await compareDatasetLines(dataset, store, lineAnchors)
    const divergedIds = [...linesCompare.edited, ...linesCompare.inserted, ...linesCompare.missing]
    if (divergedIds.length) breach.push('lines')
    linesResult = { checked: linesCompare.checked, diverged: divergedIds.length, sample: divergedIds.slice(0, 20) }
  }

  if (breach.length) {
    // a legitimate stamped write may have landed while this (potentially long) scan ran: the
    // compare then saw new content against the old anchor. The relay cannot have drained the
    // stamp mid-check (relays run under the per-dataset worker lock, held around this check by
    // the sweep and the admin actions), so a mid-check write is still visible as a pending flag
    // here — report unknown instead of recording and notifying a false breach.
    const flagsNow = await mongo.datasets.findOne({ id: dataset.id }, { projection: { _needsHistorizing: 1, _needsHistorizingLines: 1 } })
    if (flagsNow?._needsHistorizing || flagsNow?._needsHistorizingLines) {
      const date = new Date().toISOString()
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status: 'unknown' } } })
      return { status: 'unknown', date }
    }
  }

  const status: 'ok' | 'breach' = breach.length ? 'breach' : 'ok'
  const date = new Date().toISOString()
  const wasBreach = (dataset.integrity as any)?.lastCheck?.status === 'breach'
  const wasAltered = (dataset.integrity as any)?.lastCheck?.trail?.status === 'altered'
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastCheck': { date, status, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}), trail, trailCursor: latestIndex } }
  })
  if (status === 'breach' && !wasBreach) {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-breach')
  }
  if (trail.status === 'altered' && !wasAltered) {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-trail-altered')
  }
  // renewal only on a fully clean pass: under a shadow attack PutObjectRetention (keyed, no
  // version id) would extend the ATTACKER's current version while the original's lock runs out
  if (status === 'ok' && trail.status === 'ok') {
    await maybeRenew(dataset, store, latest, latestRevision)
    if (linesCompare) await maybeRenewLines(dataset, store, linesCompare.anchors)
  }
  return { status, date, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}), trail }
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
        try {
          const purged = await purgeExpiredRevisions(integrityStore())
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
