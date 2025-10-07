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
import { Histogram, Gauge } from 'prom-client'
import { internalError } from '@data-fair/lib-node/observer.js'
import { type AccountKeys } from '@data-fair/lib-express'

const debug = debugLib('workers')

export { workers } from './tasks.ts'

const workersTasksHistogram = new Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status']
})

// eslint-disable-next-line no-new
new Gauge({
  name: 'df_datasets_workers_concurrency',
  help: 'Utilization of datasets worker threads',
  labelNames: ['worker', 'status'],
  async collect () {
    for (const key of Object.keys(workers) as WorkerId[]) {
      const concurrency = workers[key].options.maxThreads * workers[key].options.concurrentTasksPerWorker
      this.set({ worker: key, status: 'max' }, concurrency)
      this.set({ worker: key, status: 'pending' }, pendingTasks[key] ? Object.keys(pendingTasks[key]).length : 0)
    }
  }
})

export const events = new EventEmitter()

export const hook = async (key: string) => {
  const { type, id } = await eventPromise<{ type: string, id: string }>(events, key, { timeout: 10000 })
  const newResource = await mongo.db.collection(type).findOne({ id })
  if (!newResource) throw new Error('resource not found after webhook hook')
  return newResource
}

const matchOwner = (o1: AccountKeys, o2: AccountKeys) => o1.type === o2.type && o1.id === o2.id

const getFreeWorkers = () => {
  return (Object.keys(workers) as WorkerId[])
    .map(key => {
      const pending = pendingTasks[key] ?? {}
      const concurrency = workers[key].options.maxThreads * workers[key].options.concurrentTasksPerWorker
      if (Object.keys(pending).length >= concurrency) return null
      const excludedOwners: AccountKeys[] = []
      if (concurrency >= 2) {
        // 1rst rule: prevent a owner from using more than half the available slots
        const maxOwnerConcurrency = Math.floor(concurrency / 2)
        for (const task of Object.values(pending)) {
          if (!excludedOwners.some(o => matchOwner(o, task.owner))) {
            const nbOwnerTasks = Object.values(pending).filter(t => matchOwner(t.owner, task.owner)).length
            if (nbOwnerTasks >= maxOwnerConcurrency) {
              debug('owner uses more than half concurrency slots for worker, exclude them', key, task.owner)
              excludedOwners.push(task.owner)
            }
          }
        }
        // 2nd rule: prevent a owner who already has a running task from using the last slot
        if (Object.keys(pending).length >= concurrency - 1) {
          for (const task of Object.values(pending)) {
            if (!excludedOwners.some(o => matchOwner(o, task.owner))) {
              debug('owner uses a concurrency slot for worker and there is only one left, exclude them', key, task.owner)
              excludedOwners.push(task.owner)
            }
          }
        }
      }
      return { key, excludedOwners }
    })
    .filter(Boolean)
}

const getFreeTasks = (type: ResourceType) => {
  const freeWorkers = getFreeWorkers()
  return tasks[type]
    .filter(task => freeWorkers.some(w => w.key === task.worker))
    .map(task => ({ task, excludedOwners: freeWorkers.find(w => w.key === task.worker)!.excludedOwners }))
}

export const queryNextResourceTask = async (_type?: string, _id?: string) => {
  for (const type of ['datasets'] as ResourceType[]) {
    if (_type && _type !== type) continue
    const freeTasks = getFreeTasks(type)
    const facets: any = {}
    if (!freeTasks.length) continue
    for (const freeTask of freeTasks) {
      const task = freeTask.task
      let filter = task.mongoFilter()
      if (freeTask.excludedOwners.length) {
        const fullFilters = [filter]
        for (const owner of freeTask.excludedOwners) {
          fullFilters.push({
            $or: [
              { 'owner.type': { $ne: owner.type } },
              { 'owner.id': { $ne: owner.id } }
            ]
          })
        }
        filter = { $and: fullFilters }
      }
      // filters.push(filter)
      // projection['_' + task.name] = { $cond: { if: filter, then: true, else: false } }
      const facet = [
        { $match: filter },
        { $project: { id: 1 } },
        { $addFields: { _lockId: { $concat: [type, ':', '$id'] } } },
        { $lookup: { from: 'locks', localField: '_lockId', foreignField: '_id', as: '_locks' } },
        { $match: { _locks: { $size: 0 } } },
        { $limit: 1 }
      ]
      if (_id) facet.unshift({ $match: { id: _id } })
      facets[task.name] = facet
    }
    const results = await mongo.db.collection<any>(type)
      .aggregate([{ $facet: facets }], { readPreference: 'primary' }).toArray().then(agg => agg[0])
    for (const freeTask of freeTasks) {
      const task = freeTask.task
      const resourceRef = results[task.name][0]
      if (resourceRef) {
        const ack = await locks.acquire(`${type}:${resourceRef.id}`, 'worker')
        if (!ack) {
          debug('failed to acquire lock for resource', type, resourceRef.id)
          continue
        }
        // re-fetch the resource to check that it was not mutated while waiting for lock
        const resource = await mongo.db.collection<any>(type).findOne({ $and: [{ id: resourceRef.id }, task.mongoFilter()] })
        if (!resource) {
          await locks.release(`${type}:${resourceRef.id}`)
          continue
        }

        if (process.env.NODE_ENV === 'test') {
          const resourceMatchedTasks = freeTasks.map(t => t.task.name).filter(t => results[t]?.some((r: any) => r.id === resource.id))
          if (resourceMatchedTasks.length > 1) events.emit('error', new Error('task selecion was not exclusive ' + JSON.stringify(resourceMatchedTasks)))
        }

        delete resource._locks
        delete resource._lockId
        // if there is something to be done in the draft mode of the dataset, it is prioritary
        if (type === 'datasets' && resource.draft && resource.draft.status !== 'finalized' && (resource.draft.status !== 'error' || task.name === 'errorRetry')) {
          if (resource.draft.draftReason) {
            mergeDraft(resource)
          } else {
            internalError('incomplete-draft', `dataset ${resource.id} has a draft object, but no draftReason`)
          }
        }
        return { type, resource, task }
      }
    }
  }
}

export const processResourceTask = async (type: ResourceType, resource: any, task: Task) => {
  const id = resource.id
  const taskFullKey = `${type}/${resource.id}/${task.name}`
  pendingTasks[task.worker][taskFullKey] = { type, id: resource.id, slug: resource.slug, owner: resource.owner }

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

    let propertyPrefix = ''
    if (resource.draftReason) {
      // we check both that the dataset was processed in draft mode and that its draft was not validated
      // this is for the spacial case of finalize that validated the draft then failed with another error
      const newResource = await mongo.db.collection(type).findOne({ id: resource.id })
      if (newResource?.draft?.status) {
        propertyPrefix = 'draft.'
      }
    }
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
    delete pendingTasks[task.worker][taskFullKey]
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
