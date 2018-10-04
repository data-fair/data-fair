const config = require('config')
const express = require('express')
const asyncWrap = require('../utils/async-wrap')
const pjson = require('../../package.json')
const findUtils = require('../utils/find')
const router = module.exports = express.Router()

// All routes in the router are only for the super admins of the service
router.use(asyncWrap(async (req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  next()
}))

router.get('/info', asyncWrap(async (req, res, next) => {
  res.send({
    version: pjson.version,
    config
  })
}))

router.get('/errors', asyncWrap(async (req, res, next) => {
  const datasets = req.app.get('db').collection('datasets')
  const query = { status: 'error' }
  const [skip, size] = findUtils.pagination(req.query)

  const aggregatePromise = datasets.aggregate([
    { $match: query },
    { $project: { _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1 } },
    { $sort: { updatedAt: -1 } },
    { $skip: skip },
    { $limit: size },
    { $lookup: { from: 'journals', localField: 'id', foreignField: 'id', as: 'journal' } },
    { $unwind: '$journal' },
    { $match: { 'journal.type': 'dataset' } },
    { $addFields: { event: { $arrayElemAt: ['$journal.events', -1] } } },
    { $project: { id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, event: 1 } }
  ]).toArray()

  const [total, results] = await Promise.all([ datasets.find(query).count(), aggregatePromise ])

  res.send({ total, results })
}))
