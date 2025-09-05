import type { ResourceType } from '#types'
import { workers, tasks, pendingTasks } from './tasks.ts'
import type { Task, WorkerId } from './types.ts'
import mergeDraft from '../datasets/utils/merge-draft.js'
import locks from '@data-fair/lib-node/locks.js'
import mongo from '#mongo'
import config from '#config'
import debugLib from 'debug'
import EventEmitter from 'node:events'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import * as journals from '../misc/utils/journals.ts'
import * as ping from './ping.ts'
import taskProgress from '../datasets/utils/task-progress.ts'
import { Histogram } from 'prom-client'
import { internalError } from '@data-fair/lib-node/observer.js'

const debug = debugLib('workers')

export { workers } from './tasks.ts'

const workersTasksHistogram = new Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status']
})

export const events = new EventEmitter()

export const hook = async (key: string) => {
  const { type, id } = await eventPromise<{ type: string, id: string }>(events, key, { timeout: 10000 })
  const newResource = await mongo.db.collection(type).findOne({ id })
  if (!newResource) throw new Error('resource not found after webhook hook')
  return newResource
}

const getFreeWorkers = () => {
  return (Object.keys(workers) as WorkerId[]).filter(key => !workers[key].needsDrain)
}

const getFreeTasks = (type: ResourceType) => {
  const freeWorkers = getFreeWorkers()
  return tasks[type].filter(t => freeWorkers.includes(t.worker))
}

export const queryNextResourceTask = async (_type?: string, _id?: string) => {
  for (const type of ['catalogs', 'applications', 'datasets'] as ResourceType[]) {
    if (_type && _type !== type) continue
    const freeTasks = getFreeTasks(type)
    const facets: any = {}
    for (const task of freeTasks) {
      const filter = task.mongoFilter()
      // filters.push(filter)
      // projection['_' + task.name] = { $cond: { if: filter, then: true, else: false } }
      const facet = [
        { $match: filter },
        { $addFields: { _lockId: { $concat: [type, ':', '$id'] } } },
        { $lookup: { from: 'locks', localField: '_lockId', foreignField: '_id', as: '_locks' } },
        { $match: { _locks: { $size: 0 } } },
        { $limit: 1 }
      ]
      if (_id) facet.unshift({ $match: { id: _id } })
      facets[task.name] = facet
    }
    const results = await mongo.db.collection<any>(type).aggregate([{ $facet: facets }]).toArray().then(agg => agg[0])
    if (process.env.NODE_ENV === 'test') {
      const matchedTasks = freeTasks.map(t => t.name).filter(t => results[t]?.length)
      if (matchedTasks.length > 1) throw new Error('task selecion was not exclusive ' + JSON.stringify(matchedTasks))
    }
    for (const task of freeTasks) {
      const resource = results[task.name][0]
      if (resource) {
        delete resource._locks
        delete resource._lockId
        // if there is something to be done in the draft mode of the dataset, it is prioritary
        if (type === 'datasets' && resource.draft && resource.draft.status !== 'finalized' && (resource.draft.status !== 'error' || task.name === 'errorRetry')) {
          mergeDraft(resource)
        }
        return { type, resource, task }
      }
    }
  }
}

export const processResourceTask = async (type: ResourceType, resource: any, task: Task) => {
  const id = resource.id
  const ack = await locks.acquire(`${type}:${id}`, 'worker')
  if (!ack) {
    debug('failed to acquire lock for resource', type, id)
    return
  }
  pendingTasks[task.worker]++

  const endTask = workersTasksHistogram.startTimer({ task: task.name })
  let progress: ReturnType<typeof taskProgress> | null = null
  if (task.eventsPrefix) {
    const noStoreEvent = type === 'datasets'
    await journals.log(type, resource, { type: task.eventsPrefix + '-start' } as any, noStoreEvent)
    progress = taskProgress(resource.id, task.eventsPrefix)
    await progress.start()
  }
  try {
    debug(`run task ${task.name} - ${type} / ${resource.slug} (${resource.id})${resource.draftReason ? ' - draft' : ''}`)
    await workers[task.worker].run(resource, { name: task.name })
    endTask({ status: 'ok' })
    debug(`finished task ${task.name} - ${type} / ${resource.slug} (${resource.id})${resource.draftReason ? ' - draft' : ''}`)

    let finalTask = false
    if (task.eventsPrefix) {
      const newResource = await mongo.db.collection(type).findOne({ id: resource.id })
      if (newResource) {
        const noStoreEvent = type === 'datasets' && (task.eventsPrefix !== 'finalize' || !!resource._partialRestStatus)
        if (resource.draftReason) {
          await journals.log(type, mergeDraft({ ...newResource }), { type: task.eventsPrefix + '-end' } as any, noStoreEvent)
        } else {
          await journals.log(type, newResource as any, { type: task.eventsPrefix + '-end' } as any, noStoreEvent)
        }
        finalTask = task.eventsPrefix === 'finalize' ||
          (task.eventsPrefix === 'validate' && resource.draftReason && !newResource.draft && newResource.status) // special case of cancelled draft
      }
      await progress?.end(false, finalTask)
    }
    events.emit(task.name + '/' + id, { type, id })
  } catch (err: any) {
    let errorMessage = (typeof err === 'string' ? err : (err.message as string)) || 'unknown error'

    if (stopped) {
      console.log('task failed while service was shutting down', errorMessage)
      endTask({ status: 'interrupted' })
      return
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
      const hasErrorRetry = await journals.hasErrorRetry(resource, type)
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

    events.emit('error', err)
  } finally {
    pendingTasks[task.worker]--
    await locks.release(`${type}:${id}`)
  }
}

let stopped = false

export const init = async () => {
  await ping.init()
}

export const loop = async () => {
  debug('start workers loop')
  let resolveWaitInterval: (() => void) | undefined

  ping.listen(async (type, id) => {
    const resourceTask = await queryNextResourceTask(type, id)
    debug('fetch resourceTask from ping', type, id, resourceTask?.task.name)
    if (resourceTask) {
      processResourceTask(resourceTask.type, resourceTask.resource, resourceTask.task).catch(err => {
        internalError('worker-task', err)
      }).then(() => {
        // at the end of task ignore the wait interval and loop immediately
        if (resolveWaitInterval) resolveWaitInterval()
      })
    }
  }).catch(err => internalError('worker-ping-listen', err))

  while (true) {
    if (stopped) break
    let resourceTask = await queryNextResourceTask()
    while (resourceTask) {
      debug('work on resource', resourceTask.type, resourceTask.resource.id, resourceTask.task.name)
      if (stopped) break
      processResourceTask(resourceTask.type, resourceTask.resource, resourceTask.task).catch(err => {
        internalError('worker-task', err)
      }).then(() => {
        // at the end of task ignore the wait interval and loop immediately
        if (resolveWaitInterval) resolveWaitInterval()
      })
      resourceTask = await queryNextResourceTask()
    }
    debug('wait for ' + config.worker.interval)
    await new Promise<void>(resolve => {
      resolveWaitInterval = resolve
      setTimeout(resolve, config.worker.interval)
    })
  }
  debug('finished workers loop')
}

export const stop = async () => {
  debug('stop workers loop')
  stopped = true
  await ping.stop()
  for (const worker of Object.values(workers)) {
    await worker.close()
  }
  debug('closed all workers')
}
