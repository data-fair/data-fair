const express = require('express')
const config = require('config')
const moment = require('moment')
const ajv = require('ajv')()
const asyncWrap = require('./async-wrap')
const dbUtils = require('./db')

const limitTypeSchema = { limit: { type: 'number' }, consumption: { type: 'number' } }
const schema = {
  type: 'object',
  required: ['id', 'type', 'lastUpdate'],
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    lastUpdate: { type: 'string', format: 'date-time' },
    store_bytes: limitTypeSchema,
    hide_brand: limitTypeSchema,
  },
}
const validate = ajv.compile(schema)

exports.init = async (db) => {
  await dbUtils.ensureIndex(db, 'limits', { id: 'text', name: 'text' }, { name: 'fulltext' })
  await dbUtils.ensureIndex(db, 'limits', { type: 1, id: 1 }, { name: 'limits-find-current', unique: true })
}

exports.get = async (db, consumer, type) => {
  const coll = db.collection('limits')
  const now = moment()
  let limit = await coll.findOne({ type: consumer.type, id: consumer.id })
  if (!limit && ['domain', 'ip-address'].includes(consumer.type)) {
    limit = {
      type: consumer.type,
      id: consumer.id,
      name: consumer.name || consumer.id,
      lastUpdate: now.toISOString(),
      ...config.anonymousLimits,
    }
    await coll.insertOne(limit)
  }

  const res = (limit && limit[type]) || { limit: 0, consumption: 0 }
  res.type = type
  res.lastUpdate = limit ? limit.lastUpdate : new Date().toISOString()
  return res
}

exports.incrementConsumption = async (db, consumer, type, inc) => {
  return (await db.collection('limits')
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $inc: { [`${type}.consumption`]: inc } }, { returnOriginal: false, upsert: true })).value
}

exports.setConsumption = async (db, consumer, type, value) => {
  return (await db.collection('limits')
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $set: { [`${type}.consumption`]: value } }, { returnOriginal: false, upsert: true })).value
}

exports.updateName = async (db, identity) => {
  await db.collection('limits')
    .updateMany({ type: identity.type, id: identity.id }, { $set: { name: identity.name } })
}

const router = exports.router = express.Router()

const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.adminMode) return next()
  if (req.query.key === config.secretKeys.limits) return next()
  res.status(401).send()
}

const isAccountAdmin = (req, res, next) => {
  if (req.query.key === config.secretKeys.limits) return next()
  if (!req.user) return res.status(401).send()
  if (req.user.adminMode) return next()
  if (!['organization', 'user'].includes(req.params.type)) return res.status(400).send('Wrong consumer type')
  if (req.params.type === 'user') {
    if (req.user.id !== req.params.id) return res.status(403).send()
  }
  if (req.params.type === 'organization') {
    const org = req.user.organizations.find(o => o.id === req.params.id && o.role === 'admin')
    if (!org) return res.status(403).send()
  }
  next()
}

// Endpoint for customers service to create/update limits
router.post('/:type/:id', isSuperAdmin, asyncWrap(async (req, res, next) => {
  req.body.type = req.params.type
  req.body.id = req.params.id
  const valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  await req.app.get('db').collection('limits')
    .replaceOne({ type: req.params.type, id: req.params.id }, req.body, { upsert: true })
  res.send(req.body)
}))

// A user can get limits information for himself only
router.get('/:type/:id', isAccountAdmin, asyncWrap(async (req, res, next) => {
  const limit = await req.app.get('db').collection('limits')
    .findOne({ type: req.params.type, id: req.params.id })
  if (!limit) return res.status(404).send()
  delete limit._id
  res.send(limit)
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
