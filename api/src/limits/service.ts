import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import debugModule from 'debug'
import { type Account, type AccountKeys } from '@data-fair/lib-express'
import type { Limit, Limits } from '#types'

const debugLimits = debugModule('limits')

export const getLimits = async (consumer: Account | AccountKeys) => {
  const now = moment()
  let limits = await mongo.limits.findOne<Limits>({ type: consumer.type, id: consumer.id }, { projection: { _id: 0 } })
  if (!limits) {
    limits = {
      type: consumer.type,
      id: consumer.id,
      name: (consumer as Account).name || consumer.id,
      lastUpdate: now.toISOString(),
      defaults: true
    }
    try {
      // a copy: insertOne adds an _id to the object it gets, and this one is sent back to the client
      await mongo.limits.insertOne({ ...limits })
    } catch (err: any) {
      if (err.code !== 11000) throw err
    }
  }
  limits.store_bytes = limits.store_bytes || { consumption: 0 }
  if (limits.store_bytes.limit === null || limits.store_bytes.limit === undefined) limits.store_bytes.limit = config.defaultLimits.totalStorage
  limits.indexed_bytes = limits.indexed_bytes || { consumption: 0 }
  if (limits.indexed_bytes.limit === null || limits.indexed_bytes.limit === undefined) limits.indexed_bytes.limit = config.defaultLimits.totalIndexed
  limits.nb_datasets = limits.nb_datasets || { consumption: 0 }
  if (limits.nb_datasets.limit === null || limits.nb_datasets.limit === undefined) limits.nb_datasets.limit = config.defaultLimits.nbDatasets
  // counted on the fly instead of being stored, so it never drifts (like the portals pages)
  limits.nb_applications = {
    limit: limits.nb_applications?.limit ?? config.defaultLimits.nbApplications,
    consumption: await mongo.applications.countDocuments({ 'owner.type': consumer.type, 'owner.id': consumer.id })
  }
  return limits
}

const calculateRemainingLimit = (limits: Limits, key: keyof Limits) => {
  const limit = (limits?.[key] as Limit)?.limit
  if (limit === -1 || limit === null || limit === undefined) return -1
  const consumption = (limits?.[key] && (limits[key] as Limit).consumption) || 0
  return Math.max(0, limit - consumption)
}

export const remaining = async (consumer: AccountKeys) => {
  const limits = await getLimits(consumer)
  return {
    storage: calculateRemainingLimit(limits, 'store_bytes'),
    indexed: calculateRemainingLimit(limits, 'indexed_bytes'),
    nbDatasets: calculateRemainingLimit(limits, 'nb_datasets'),
    nbApplications: calculateRemainingLimit(limits, 'nb_applications')
  }
}

export const incrementConsumption = async (consumer: AccountKeys, type: keyof Limits, inc: number) => {
  return await mongo.limits
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $inc: { [`${type}.consumption`]: inc } }, { returnDocument: 'after', upsert: true })
}

export const setConsumption = async (consumer: AccountKeys, type: keyof Limits, value: number) => {
  return await mongo.limits
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $set: { [`${type}.consumption`]: value } }, { returnDocument: 'after', upsert: true })
}

/**
 * The i18n key of the quota refusing the transfer of these datasets and nbApplications applications
 * (a resource and its fragments) to newOwner, if any. A transfer within the same account (a department move) is not checked.
 */
export const changeOwnerLimitError = async (currentOwner: AccountKeys, newOwner: AccountKeys, datasets: { storage?: { size?: number, indexed?: { size?: number } } }[], nbApplications = 0) => {
  if ((!datasets.length && !nbApplications) || (newOwner.type === currentOwner.type && newOwner.id === currentOwner.id)) return null
  const left = await remaining(newOwner)
  const size = datasets.reduce((sum, d) => sum + (d.storage?.size ?? 0), 0)
  const indexed = datasets.reduce((sum, d) => sum + (d.storage?.indexed?.size ?? 0), 0)
  let error: 'exceedLimitNbDatasets' | 'exceedLimitNbApplications' | 'exceedLimitStorage' | 'exceedLimitIndexed' | null = null
  if (left.nbDatasets !== -1 && left.nbDatasets < datasets.length) error = 'exceedLimitNbDatasets'
  else if (left.nbApplications !== -1 && left.nbApplications < nbApplications) error = 'exceedLimitNbApplications'
  else if (left.storage !== -1 && left.storage < size) error = 'exceedLimitStorage'
  else if (left.indexed !== -1 && left.indexed < indexed) error = 'exceedLimitIndexed'
  if (error) debugLimits(`${error}/changeOwner`, { owner: newOwner, remaining: left, nbDatasets: datasets.length, nbApplications, size, indexed })
  return error
}
