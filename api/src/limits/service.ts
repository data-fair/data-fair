import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import { type Account, type AccountKeys } from '@data-fair/lib-express'
import type { Limit, Limits } from '#types'

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
      await mongo.limits.insertOne(limits)
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
    nbDatasets: calculateRemainingLimit(limits, 'nb_datasets')
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
