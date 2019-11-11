// Define a few routes to be used to synchronize data with the CRM / plans / limits manager
const express = require('express')
const config = require('config')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const cacheHeaders = require('../utils/cache-headers')

const router = module.exports = express.Router()

const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) return next()
  if (req.query.key === config.secretKeys.limits) return next()
  res.status(401).send()
}

const isAccountAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (req.user.isAdmin) return next()
  if (req.query.key === config.secretKeys.limits) return next()
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

// notify a limit change with secret key or as admin
router.post('/:type/:id', isSuperAdmin, asyncWrap(async (req, res) => {
  await req.app.get('db').collection('limits')
    .updateOne({ type: req.params.type, id: req.params.id }, { $set: { ...req.body, ...req.params } }, { upsert: true })
  res.send()
}))

// user can read his limit
router.get('/:type/:id', cacheHeaders.noCache, isAccountAdmin, asyncWrap(async (req, res) => {
  const limits = await req.app.get('db').collection('limits')
    .findOne({ type: req.params.type, id: req.params.id })
  res.send(limits)
}))

// admin only overall list of limits
router.get('', cacheHeaders.noCache, isSuperAdmin, asyncWrap(async(req, res) => {
  const limits = req.app.get('db').collection('limits')
  const [skip, size] = findUtils.pagination(req.query)
  const query = {}
  if (req.query.q) query.$text = { $search: req.query.q }
  const findPromise = limits.find(query).sort({ name: 1 }).limit(size).skip(skip).toArray()
  const [count, results] = await Promise.all([limits.countDocuments({}), findPromise])
  res.send({ count, results })
}))
