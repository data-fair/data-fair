const express = require('express')
const config = require('config')
const moment = require('moment')
const ajv = require('../utils/ajv')
const asyncWrap = require('./async-handler')
const dbUtils = require('./db')

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

 export const init = async (db) => {
  await dbUtils.ensureIndex(db, 'limits', { id: 'text', name: 'text' }, { name: 'fulltext' })
  await dbUtils.ensureIndex(db, 'limits', { type: 1, id: 1 }, { name: 'limits-find-current', unique: true })
}

 export const getLimits = async (db, consumer) => {
  const coll = db.collection('limits')
  const now = moment()
  let limits = await coll.findOne({ type: consumer.type, id: consumer.id })
  if (!limits) {
    limits = {
      type: consumer.type,
      id: consumer.id,
      name: consumer.name || consumer.id,
      lastUpdate: now.toISOString(),
      defaults: true
    }
    try {
      await coll.insertOne(limits)
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  limits.store_bytes = limits.store_bytes || { consumption: 0 }
  if ([undefined, null].includes(limits.store_bytes.limit)) limits.store_bytes.limit = config.defaultLimits.totalStorage
  limits.indexed_bytes = limits.indexed_bytes || { consumption: 0 }
  if ([undefined, null].includes(limits.indexed_bytes.limit)) limits.indexed_bytes.limit = config.defaultLimits.totalIndexed
  limits.nb_datasets = limits.nb_datasets || { consumption: 0 }
  if ([undefined, null].includes(limits.nb_datasets.limit)) limits.nb_datasets.limit = config.defaultLimits.nbDatasets
  return limits
}

 export const get = async (db, consumer, type) => {
  const limits = await  export const getLimits(db, consumer)
  const res = (limits && limits[type]) || { limit: 0, consumption: 0 }
  res.type = type
  res.lastUpdate = limits ? limits.lastUpdate : new Date().toISOString()
  return res
}

const calculateRemainingLimit = (limits, key) => {
  const limit = limits && limits[key] && limits[key].limit
  if (limit === -1) return -1
  const consumption = (limits && limits[key] && limits[key].consumption) || 0
  return Math.max(0, limit - consumption)
}

 export const remaining = async (db, consumer) => {
  const limits = await  export const getLimits(db, consumer)
  return {
    storage: calculateRemainingLimit(limits, 'store_bytes'),
    indexed: calculateRemainingLimit(limits, 'indexed_bytes'),
    nbDatasets: calculateRemainingLimit(limits, 'nb_datasets')
  }
}

 export const incrementConsumption = async (db, consumer, type, inc) => {
  return (await db.collection('limits')
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $inc: { [`${type}.consumption`]: inc } }, { returnDocument: 'after', upsert: true })).value
}

 export const setConsumption = async (db, consumer, type, value) => {
  return (await db.collection('limits')
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $set: { [`${type}.consumption`]: value } }, { returnDocument: 'after', upsert: true })).value
}

const router =  export const router = express.Router()

const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.adminMode) return next()
  if (req.query.key === config.secretKeys.limits) return next()
  res.status(401).type('text/plain').send()
}

const isAccountMember = (req, res, next) => {
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
router.post('/:type/:id', isSuperAdmin, asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
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
}))

// A user can get limits information for himself only
router.get('/:type/:id', isAccountMember, asyncWrap(async (req, res, next) => {
  const limits = await  export const getLimits(req.app.get('db'), { type: req.params.type, id: req.params.id })
  if (!limits) return res.status(404).send()
  delete limits._id
  res.send(limits)
}))

router.get('/', isSuperAdmin, asyncWrap(async (req, res, next) => {
  const filter = {}
  if (req.query.type) filter.type = req.query.type
  if (req.query.id) filter.id = req.query.id
  const results = await req.app.get('db').collection('limits')
    .find(filter)
    .sort({ lastUpdate: -1 })
    .project({ _id: 0 })
    .limit(10000)
    .toArray()
  res.send({ results, count: results.length })
}))
