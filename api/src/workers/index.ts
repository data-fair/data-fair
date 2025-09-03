import type { ResourceType } from '#types'
import { workers, tasks } from './tasks.ts'
import type { WorkerId } from './types.ts'
import mergeDraft from '../datasets/utils/merge-draft.js'
import locks from '@data-fair/lib-node/locks.js'
import mongo from '#mongo'
import config from '#config'
import debugLib from 'debug'
import EventEmitter from 'node:events'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import * as journals from '../misc/utils/journals.ts'
import taskProgress from '../datasets/utils/task-progress.ts'
import { Histogram } from 'prom-client'
import { internalError } from '@data-fair/lib-node/observer.js'

const debug = debugLib('workers')

const workersTasksHistogram = new Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status']
})

export const events = new EventEmitter()

export const hook = async (key: string) => {
  const { type, id } = await eventPromise<{ type: string, id: string }>(events, key, { timeout: 10000 })
  return mongo.db.collection(type).findOne({ id })
}

const getFreeWorkers = () => {
  return (Object.keys(workers) as WorkerId[]).filter(key => !workers[key].needsDrain)
}

const getFreeTasks = (type: ResourceType) => {
  const freeWorkers = getFreeWorkers()
  return tasks[type].filter(t => freeWorkers.includes(t.worker))
}

const getTaskPair = async (type: ResourceType, id: string) => {
  const resource = await mongo.db.collection<any>(type).findOne({ id })
  if (!resource) return
  const task = getFreeTasks(type).find(t => t.jsFilter(resource))
  if (!task) return

  // if there is something to be done in the draft mode of the dataset, it is prioritary
  if (type === 'datasets' && resource.draft && resource.draft.status !== 'finalized' && resource.draft.status !== 'error') {
    mergeDraft(resource)
  }

  return { resource, task }
}

export const queryNextResource = async () => {
  for (const type of ['catalogs', 'applications', 'datasets'] as ResourceType[]) {
    const mongoFilters = getFreeTasks(type).map(t => t.mongoFilter())
    const agg = await mongo.db.collection<any>(type).aggregate([
      { $match: { $or: mongoFilters } },
      { $project: { id: 1 } },
      { $lookup: { from: 'locks', localField: 'id', foreignField: '_id', as: '_locks' } },
      { $match: { _locks: { $not: { $size: 0 } } } },
      { $limit: 1 }
    ]).toArray()
    if (agg[0]) return { type, id: agg[0]?.id }
  }
}

export const processResource = async (type: ResourceType, id: string) => {
  const ack = await locks.acquire(`${type}:${id}`, 'worker')
  if (!ack) {
    debug('failed to acquire lock for resource', type, id)
    return
  }

  let taskPair = await getTaskPair(type, id)
  if (!taskPair) {
    debug('failed to find matching resource/task', type, id)
    return
  }

  while (taskPair) {
    const { task, resource } = taskPair
    const endTask = workersTasksHistogram.startTimer({ task: task.name })
    let progress: ReturnType<typeof taskProgress> | null = null
    if (task.eventsPrefix) {
      const noStoreEvent = type === 'datasets'
      await journals.log(type, resource, { type: task.eventsPrefix + '-start' } as any, noStoreEvent)
      progress = taskProgress(resource.id, task.eventsPrefix)
      await progress.start()
    }
    try {
      debug('run task', task.name, type, id)
      await workers[task.worker].run(resource, { name: task.name })
      events.emit(task.name + '/' + id, { type, id })
    } catch (err: any) {
      let errorMessage = err.message as string

      if (stopped) {
        console.log('task failed while service was shutting down', errorMessage)
        endTask({ status: 'interrupted' })
        break
      }

      endTask({ status: 'error' })

      console.warn(`failure in worker ${task.name} - ${type} / ${resource.slug} (${resource.id})`, errorMessage)

      // some error are caused by bad input, we should not retry these
      let retry = !errorMessage.startsWith('[noretry] ')
      if (!retry) {
        debug('error message started by [noretry]')
        errorMessage = errorMessage.replace('[noretry] ', '')
      }
      if (retry) {
        // if this is the second time we get this error, do not retry anymore
        const hasErrorRetry = await journals.hasErrorRetry(mongo.db, resource, type)
        debug('does the journal have a recent error-retry event', hasErrorRetry)
        if (hasErrorRetry) {
          debug('last log in journal was already a retry')
          retry = false
        }
      }

      await progress?.end(true)

      const propertyPrefix = resource.draftReason ? 'draft.' : ''
      const patch: any = {
        $set: {
          [propertyPrefix + 'status']: 'error',
          [propertyPrefix + 'errorStatus']: resource.status
        }
      }
      if (retry) {
        await journals.log(type, resource, { type: 'error-retry', data: errorMessage } as any)
        patch.$set[propertyPrefix + 'errorRetry'] = new Date((new Date()).getTime() + config.worker.errorRetryDelay).toISOString()
      } else {
        await journals.log(type, resource, { type: 'error', data: errorMessage } as any)
        patch.$unset = { [propertyPrefix + 'errorRetry']: 1 }
      }

      await mongo.db.collection(type).updateOne({ id: resource.id }, patch)
      break
    }

    if (stopped) break

    taskPair = await getTaskPair(type, id)
  }

  await locks.release(`${type}:${id}`)
  return true
}

let stopped = false

export const start = async () => {
  while (true) {
    if (stopped) break
    let resourceRef = await queryNextResource()
    while (resourceRef) {
      if (stopped) break
      processResource(resourceRef.type, resourceRef.id).catch(err => {
        internalError('worker', err)
      })
      resourceRef = await queryNextResource()
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, config.worker.interval)))
  }
}

export const stop = async () => {
  stopped = true
  for (const worker of Object.values(workers)) {
    await worker.close()
  }
}
