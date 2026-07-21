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

export type Check = {
  status: 'ok' | 'breach' | 'unknown'
  date?: string
  breach?: Array<'file' | 'metadata' | 'lines'>
  lines?: { checked: number, diverged: number, sample: string[] }
}

// Compare live Mongo lines against the latest anchors recovered from LIST alone (the sha256 is
// embedded in each key). Returns the three divergence shapes plus the anchor map (restore/fix
// need the keys to fetch payloads / write tombstones).
export const compareDatasetLines = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>) => {
  // fold LIST pages incrementally: the prefix holds every revision within the retention window,
  // but only the latest anchor per line is kept in memory (O(live lines), bounded by the gate)
  const anchors = new Map<string, lops.LatestLineAnchor>()
  for await (const page of store.iterateRevisionPages(lops.linesPrefix(dataset.owner, dataset.id))) {
    lops.foldLatestLineAnchors(anchors, page.map((r) => r.key))
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
}

export const checkDataset = async (dataset: DatasetInternal): Promise<Check> => {
  // a relay is pending: the hot state legitimately differs from the latest anchor until the relay
  // writes the new revision — checking now would raise a false breach alert
  if (dataset._needsHistorizing || dataset._needsHistorizingLines) return { status: 'unknown' }
  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const latest = ops.latestKey((await store.listRevisions(prefix, { delimiter: '/' })).map((r) => r.key))
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

  let linesResult: { checked: number, diverged: number, sample: string[] } | undefined
  let linesCompare: Awaited<ReturnType<typeof compareDatasetLines>> | undefined
  if (isRestDataset(dataset as any)) {
    linesCompare = await compareDatasetLines(dataset, store)
    const divergedIds = [...linesCompare.edited, ...linesCompare.inserted, ...linesCompare.missing]
    if (divergedIds.length) breach.push('lines')
    linesResult = { checked: linesCompare.checked, diverged: divergedIds.length, sample: divergedIds.slice(0, 20) }
  }

  const status: 'ok' | 'breach' = breach.length ? 'breach' : 'ok'
  const date = new Date().toISOString()
  const wasBreach = (dataset.integrity as any)?.lastCheck?.status === 'breach'
  await mongo.datasets.updateOne({ id: dataset.id }, {
    $set: { 'integrity.lastCheck': { date, status, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}) } }
  })
  if (status === 'breach' && !wasBreach) {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-breach')
  }
  if (status === 'ok') {
    await maybeRenew(dataset, store, latest, latestRevision)
    if (linesCompare) await maybeRenewLines(dataset, store, linesCompare.anchors)
  }
  return { status, date, ...(breach.length ? { breach } : {}), ...(linesResult ? { lines: linesResult } : {}) }
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
    try { await checkDataset(dataset as DatasetInternal) } catch (err) { internalError('integrity-check-dataset', err) }
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
