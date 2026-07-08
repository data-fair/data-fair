// api/src/integrity/checker.ts
import cron, { type ScheduledTask } from 'node-cron'
import Debug from 'debug'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import config from '#config'
import mongo from '#mongo'
import type { DatasetInternal } from '#types'
import { integrityStore } from './store-factory.ts'
import * as ops from './operations.ts'
import { md5OfStorageFile } from './hash.ts'
import * as datasetUtils from '../datasets/utils/index.ts'
import * as notifications from '../misc/utils/notifications.ts'

const debug = Debug('integrity-checker')
const BATCH = 100

export type ClassCheck = { status: 'ok' | 'breach' | 'unknown', date?: string }

// Lock renewal by extension (architecture §3.4 Option B): when a passing check finds the current
// anchor is "old" (per ops.needsRenewal), push its compliance retain-until forward in place so the
// current state stays protected indefinitely. Failure is surfaced loudly, never thrown — the anchor
// stays valid until its existing retain-until, leaving lead time to react.
const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, cls: ops.IntegrityClass, latestKey: string): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  const classState = (dataset.integrity as any)?.[cls]
  if (!ops.needsRenewal(classState?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  try {
    await store.extendRetention(latestKey, retainUntil)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: {
        [`integrity.${cls}.lastRevision.retainUntil`]: retainUntil.toISOString(),
        [`integrity.${cls}.lastRenewal`]: { date, status: 'ok', retainUntil: retainUntil.toISOString() }
      }
    })
  } catch (err) {
    internalError('integrity-renew', err)
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: { [`integrity.${cls}.lastRenewal`]: { date, status: 'failed', error: err instanceof Error ? err.message : String(err) } }
    })
  }
}

const checkClass = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, cls: ops.IntegrityClass): Promise<ClassCheck> => {
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id, cls)
  const latest = ops.latestKey((await store.listRevisions(prefix)).map((r) => r.key))
  if (!latest) {
    // no anchor written yet (e.g. right after an owner transfer, before the relay re-anchors this
    // class under the new prefix): persist the verdict so a stale pre-transfer 'ok' cannot linger
    // and the sweep cursor (sorted on lastCheck.date) advances past this dataset
    const date = new Date().toISOString()
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { [`integrity.${cls}.lastCheck`]: { date, status: 'unknown' } } })
    return { status: 'unknown', date }
  }

  const expected = (await store.getRevision(latest)).hash
  let match: boolean
  if (cls === 'file') {
    // a missing file is the strongest tamper signal (deleted out-of-band) → breach, not an exception
    const actualMd5 = await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
      if (err.status === 404) return undefined
      throw err
    })
    match = actualMd5 === expected.md5
  } else {
    // hash the live doc, freshly re-read (the caller's copy may be a cleaned/projected response doc)
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    match = !!fresh && ops.metadataHash(fresh) === expected.sha256
  }

  const status: 'ok' | 'breach' = match ? 'ok' : 'breach'
  const date = new Date().toISOString()
  const wasBreach = (dataset.integrity as any)?.[cls]?.lastCheck?.status === 'breach'
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { [`integrity.${cls}.lastCheck`]: { date, status } } })
  if (status === 'breach' && !wasBreach) {
    // per-class event key/i18n (integrity-breach-file / integrity-breach-metadata): a class-blind
    // key+wording would tell an owner "the data file was tampered" when it was actually the metadata
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', `integrity-breach-${cls}`)
  }
  if (status === 'ok') await maybeRenew(dataset, store, cls, latest)
  return { status, date }
}

export const checkDataset = async (dataset: DatasetInternal): Promise<{ file?: ClassCheck, metadata?: ClassCheck }> => {
  // a relay is pending: the hot state legitimately differs from the latest anchor until the relay
  // writes the new revision — checking now would raise a false breach alert
  if (dataset._needsHistorizing) return { file: { status: 'unknown' }, metadata: { status: 'unknown' } }
  const store = integrityStore()
  return {
    file: await checkClass(dataset, store, 'file'),
    metadata: await checkClass(dataset, store, 'metadata')
  }
}

const runOnce = async () => {
  const cursor = mongo.datasets
    .find({ 'integrity.active': true, _needsHistorizing: { $exists: false } })
    .sort({ 'integrity.file.lastCheck.date': 1 })
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
    try { await runOnce() } finally { await locks.release('integrity-check-task') }
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
