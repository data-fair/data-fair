import { ResourceType } from '#types'
import { workers, tasks } from './tasks.ts'
import type { WorkerId } from './types.ts'
import mergeDraft from '../datasets/utils/merge-draft.js'
import locks from '@data-fair/lib-node/locks.js'
import mongo from '#mongo'
import debugLib from 'debug'

const debug = debugLib('workers')

const getFreeWorkers = () => {
  return (Object.keys(workers) as WorkerId[]).filter(key => !workers[key].needsDrain)
}

const getFreeTasks = (type: ResourceType) => {
  const freeWorkers = getFreeWorkers()
  return tasks[type].filter(t => freeWorkers.includes(t.worker))
}

const getTaskPair = async (type: ResourceType, id: string) => {
  const resource = await mongo.db.collection<any>(type).findOne({ id })
  const task = getFreeTasks(type).find(t => t.jsFilter(resource))

  // if there is something to be done in the draft mode of the dataset, it is prioritary
  if (type === 'datasets' && resource.draft && resource.draft.status !== 'finalized' && resource.draft.status !== 'error') {
    mergeDraft(resource)
  }

  return { resource, task }
}

export const queryNextResource = async (type: ResourceType) => {
  const mongoFilters = getFreeTasks(type).map(t => t.mongoFilter())
  const agg = await mongo.db.collection<any>(type).aggregate([
    { $match: { $or: mongoFilters } },
    { $project: { id: 1 } },
    { $lookup: { from: 'locks', localField: 'id', foreignField: '_id', as: '_locks' } },
    { $match: { _locks: { $not: { $size: 0 } } } },
    { $limit: 1 }
  ]).toArray()
  return agg[0]?.id
}

export const processResource = async (type: ResourceType, id: string) => {
  const ack = await locks.acquire(`${type}:${id}`, 'worker')
  if (!ack) {
    debug('failed to acquire lock for resource', type, id)
    return false
  }

  let taskPair = await getTaskPair(type, id)
  if (!taskPair.resource) {
    debug('failed to find matching resource', type, id)
    return false
  }
  if (!taskPair.task) {
    debug('failed to find matching task for resource', type, id)
    return false
  }

  while (taskPair.task && taskPair.resource) {
    try {
      debug('run task', taskPair.task.name, type, id)
      await workers[taskPair.task.worker].run(taskPair.resource, { name: taskPair.task.name })
    } catch (err: any) {
      // TODO: manage error
      break
    }
    taskPair = await getTaskPair(type, id)
  }

  await locks.release(`${type}:${id}`)
  return true
}
