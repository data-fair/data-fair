import cron, { type ScheduledTask } from 'node-cron'
import Debug from 'debug'
import locks from '@data-fair/lib-node/locks.js'
import log from '@data-fair/lib-node/log.js'
import config from '#config'
import mongo from '#mongo'
import { onlyShelved } from './operations.ts'
import { purgeOwner } from './service.ts'

const debug = Debug('bin-purge')

let stopped = false
let taskPromise: Promise<void> | undefined
let scheduledTask: ScheduledTask | undefined

/** Purge, for every owner holding shelved items, what is past retention or whose bin was disabled. */
export const runOnce = async (): Promise<number> => {
  const owners = new Map<string, { type: string, id: string }>()
  for (const collection of [mongo.datasets, mongo.applications]) {
    for (const owner of await collection.distinct('owner', onlyShelved) as { type: string, id: string }[]) {
      owners.set(`${owner.type}:${owner.id}`, { type: owner.type, id: owner.id })
    }
  }
  let count = 0
  for (const owner of owners.values()) {
    if (stopped) break
    try {
      count += await purgeOwner(owner)
    } catch (err) {
      log.error('bin purge failed for an owner', { code: 'bin-purge-owner', err })
    }
  }
  return count
}

export const task = async () => {
  if (stopped) return
  try {
    debug('run bin purge cron task')
    const ack = await locks.acquire('bin-purge-task')
    if (!ack) {
      debug('another pod holds the bin-purge lock, skipping this run')
      return
    }
    try {
      await runOnce()
    } finally {
      await locks.release('bin-purge-task')
    }
  } catch (err) {
    log.error('bin purge cron failed', { code: 'bin-purge-cron', err })
  }
}

export const start = () => {
  scheduledTask = cron.schedule(config.binPurgeCron, () => {
    if (taskPromise) {
      log.warn('bin-purge task already running', { code: 'bin-purge-running' })
      return
    }
    taskPromise = task()
    taskPromise.finally(() => { taskPromise = undefined })
  })
}

export const stop = async () => {
  stopped = true
  scheduledTask?.stop()
  if (taskPromise) await taskPromise
}
