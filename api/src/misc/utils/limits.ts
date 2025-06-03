import express from 'express'
import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import * as ajv from '../utils/ajv.js'
import type { Account, AccountKeys } from '@data-fair/lib-express'
import type { Limit, Limits, Request } from '#types'
import type { Response, NextFunction, RequestHandler } from 'express'
import type { Filter } from 'mongodb'

const limitTypeSchema = { type: 'object', properties: { limit: { type: 'number' }, consumption: { type: 'number' } } }
const schema = {
  type: 'object',
  required: ['id', 'type', 'lastUpdate'],
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    lastUpdate: { type: 'string', format: 'date-time' },
    defaults: { type: 'boolean', title: 'these limits were defined using default values only, not specifically defined' },
    store_bytes: limitTypeSchema,
    indexed_bytes: limitTypeSchema,
    nb_datasets: limitTypeSchema,
    hide_brand: limitTypeSchema
  }
}
const validate = ajv.compile(schema)

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

/* const get = async (consumer: AccountKeys, type: keyof Limits) => {
  const limits = await getLimits(consumer)
  const res = (limits?.[type] || { limit: 0, consumption: 0 }) as Limit
  res.type = type
  res.lastUpdate = limits ? limits.lastUpdate : new Date().toISOString()
  return res
} */

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

export const router = express.Router()

const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.adminMode) return next()
  if (req.query.key === config.secretKeys.limits) return next()
  res.status(401).type('text/plain').send()
}

const isAccountMember = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.key === config.secretKeys.limits) return next()
  if (!req.user) return res.status(401).type('text/plain').send()
  if (req.user.adminMode) return next()
  if (!['organization', 'user'].includes(req.params.type)) return res.status(400).type('text/plain').send('Wrong consumer type')
  if (req.params.type === 'user') {
    if (req.user.id !== req.params.id) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  }
  if (req.params.type === 'organization') {
    const org = req.user.organizations.find(o => o.id === req.params.id)
    if (!org) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  }
  next()
}

// Endpoint for customers service to create/update limits
router.post('/:type/:id', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const db = mongo.db
  req.body.type = req.params.type
  req.body.id = req.params.id
  validate(req.body)
  const existingLimits = await db.collection('limits').findOne({ type: req.params.type, id: req.params.id })
  if (existingLimits) {
    for (const key of ['store_bytes', 'indexed_bytes', 'nb_datasets']) {
      if (req.body[key] && existingLimits[key]?.consumption) req.body[key].consumption = existingLimits[key].consumption
    }
  }
  await db.collection('limits')
    .replaceOne({ type: req.params.type, id: req.params.id }, req.body, { upsert: true })
  res.send(req.body)
})

// A user can get limits information for himself only
router.get('/:type/:id', isAccountMember as RequestHandler, async (req, res, next) => {
  const limits = await getLimits({ type: req.params.type as 'user' | 'organization', id: req.params.id })
  if (!limits) {
    res.status(404).send()
    return
  }
  res.send(limits)
})

router.get('/', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const filter: Filter<Limits> = {}
  if (req.query.type) filter.type = req.query.type
  if (req.query.id) filter.id = req.query.id
  const results = await mongo.limits
    .find(filter)
    .sort({ lastUpdate: -1 })
    .project({ _id: 0 })
    .limit(10000)
    .toArray()
  res.send({ results, count: results.length })
})
