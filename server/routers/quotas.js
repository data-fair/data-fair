// Define a few routes to be used to synchronize data with the CRM / plans / quotas manager
const express = require('express')
const config = require('config')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const cacheHeaders = require('../utils/cache-headers')

const router = module.exports = express.Router()

// notify a quota change with secret key or as admin
router.post('/:type/:id', asyncWrap(async (req, res) => {
  if (!((req.user && req.user.isAdmin) || (config.secretKeys.quotas && config.secretKeys.quotas === req.query.key))) {
    return res.status(403).send('Bad secret in "key" parameter')
  }
  await req.app.get('db').collection('quotas')
    .updateOne({ type: req.params.type, id: req.params.id }, { $set: { ...req.body, ...req.params } }, { upsert: true })
  res.send()
}))

// user can read his quota
router.get('/:type/:id', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (req.params.type === 'user' && req.params.id !== req.user.id) return res.status(403).send()
  if (req.params.type === 'organization') {
    const orga = req.user.organizations.find(o => o.id === req.params.id)
    if (!orga || orga.role !== config.adminRole) return res.status(403).send()
  }
  const quotas = await req.app.get('db').collection('quotas')
    .findOne({ type: req.params.type, id: req.params.id })
  res.send(quotas)
}))

// admin only overall list of quotas
router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  const quotas = req.app.get('db').collection('quotas')
  const [skip, size] = findUtils.pagination(req.query)
  const query = {}
  if (req.query.q) query.$text = { $search: req.query.q }
  const findPromise = quotas.find(query).sort({ name: 1 }).limit(size).skip(skip).toArray()
  const [count, results] = await Promise.all([ quotas.countDocuments({}), findPromise ])
  res.send({ count, results })
}))
