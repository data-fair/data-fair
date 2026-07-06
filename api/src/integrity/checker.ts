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

// Lock renewal by extension (architecture §3.4 Option B): when a passing check finds the current
// anchor is "old" (per ops.needsRenewal), push its compliance retain-until forward in place so the
// current state stays protected indefinitely. Failure is surfaced loudly, never thrown — the anchor
// stays valid until its existing retain-until, leaving lead time to react.
const maybeRenew = async (dataset: DatasetInternal, store: ReturnType<typeof integrityStore>, latestKey: string): Promise<void> => {
  const retentionDays = config.integrity?.retention?.days ?? 365
  if (!ops.needsRenewal(dataset.integrity?.lastRevision?.retainUntil, Date.now(), retentionDays)) return
  const date = new Date().toISOString()
  const retainUntil = new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
  try {
    await store.extendRetention(latestKey, retainUntil)
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

export const checkDataset = async (dataset: DatasetInternal): Promise<{ status: 'ok' | 'breach' | 'unknown', date?: string }> => {
  // a relay is pending: the stored file legitimately differs from the latest anchor until the
  // relay writes the new revision — checking now would raise a false breach alert (review finding 2)
  if (dataset._needsHistorizing) return { status: 'unknown' }

  const store = integrityStore()
  const prefix = ops.revisionPrefix(dataset.owner, dataset.id)
  const latest = ops.latestKey(await store.listRevisionKeys(prefix))
  if (!latest) return { status: 'unknown' } // no anchor written yet

  const expectedMd5 = (await store.getRevision(latest)).hash.md5
  // a missing file is the strongest tamper signal (deleted out-of-band) → breach, not an exception;
  // both storage backends normalize a missing file to httpError(404)
  const actualMd5 = await md5OfStorageFile(datasetUtils.originalFilePath(dataset)).catch((err) => {
    if (err.status === 404) return undefined
    throw err
  })
  const status: 'ok' | 'breach' = actualMd5 === expectedMd5 ? 'ok' : 'breach'
  const date = new Date().toISOString()
  const wasBreach = dataset.integrity?.lastCheck?.status === 'breach'
  await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.lastCheck': { date, status } } })
  if (status === 'breach' && !wasBreach) {
    await notifications.sendResourceEvent('datasets', dataset as any, 'worker:integrity-checker', 'integrity-breach')
  }
  if (status === 'ok') await maybeRenew(dataset, store, latest)
  return { status, date }
}

const runOnce = async () => {
  const cursor = mongo.datasets
    .find({ 'integrity.active': true, _needsHistorizing: { $ne: true } })
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
