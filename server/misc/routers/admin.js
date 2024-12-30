import express from 'express'
import * as status from './status.js'
import asyncWrap from '../utils/async-handler.js'
import * as findUtils from '../utils/find.js'
import * as baseAppsUtils from '../../base-applications/utils.js'
import * as cacheHeaders from '../utils/cache-headers.js'

const router = express.Router()
export default router

// All routes in the router are only for the super admins of the service
router.use(asyncWrap(async (req, res, next) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  if (!req.user.adminMode) return res.status(403).type('text/plain').send()
  next()
}))

router.use(cacheHeaders.noCache)

let info = { version: process.env.NODE_ENV }
router.get('/info', asyncWrap(async (req, res) => {
  try { info = await import('../../../BUILD.json', { with: { type: 'json' } }) } catch (err) {}
  res.json(info)
}))

router.get('/status', (req, res, next) => {
  status.status(req, res, next)
})

router.get('/datasets-errors', asyncWrap(async (req, res, next) => {
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

  const [count, results] = await Promise.all([datasets.countDocuments(query), aggregatePromise])

  res.send({ count, results })
}))

router.get('/datasets-es-warnings', asyncWrap(async (req, res, next) => {
  const datasets = req.app.get('db').collection('datasets')
  const query = { esWarning: { $exists: true, $ne: null } }
  const [skip, size] = findUtils.pagination(req.query)

  const resultsPromise = datasets
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, owner: 1, esWarning: 1, status: 1 })
    .toArray()

  const [count, results] = await Promise.all([datasets.countDocuments(query), resultsPromise])

  res.send({ count, results })
}))

router.get('/applications-errors', asyncWrap(async (req, res, next) => {
  const applications = req.app.get('db').collection('applications')
  const query = { errorMessage: { $exists: true } }
  const [skip, size] = findUtils.pagination(req.query)
  const resultsPromise = applications
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, errorMessage: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([applications.countDocuments(query), resultsPromise])

  res.send({ count, results })
}))

router.get('/applications-draft-errors', asyncWrap(async (req, res, next) => {
  const applications = req.app.get('db').collection('applications')
  const query = { errorMessageDraft: { $exists: true } }
  const [skip, size] = findUtils.pagination(req.query)
  const resultsPromise = applications
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, description: 1, updatedAt: 1, owner: 1, errorMessageDraft: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([applications.countDocuments(query), resultsPromise])

  res.send({ count, results })
}))

router.get('/owners', asyncWrap(async (req, res) => {
  const limits = req.app.get('db').collection('limits')
  const [skip, size] = findUtils.pagination(req.query)
  const query = {}
  if (req.query.q) query.$text = { $search: req.query.q }

  const agg = [{
    $match: query
  }, {
    $sort: { name: 1 }
  }, {
    $skip: skip
  }, {
    $limit: size
  }, {
    // imperfect.. we should do a lookup on both owner.id and owner.type
    $lookup: {
      from: 'datasets',
      localField: 'id',
      foreignField: 'owner.id',
      as: 'datasets'
    }
  }, {
    // imperfect.. we should do a lookup on both owner.id and owner.type
    $lookup: {
      from: 'applications',
      localField: 'id',
      foreignField: 'owner.id',
      as: 'applications'
    }
  }, {
    $project: {
      id: 1,
      type: 1,
      name: 1,
      nbDatasets: { $size: '$datasets' },
      nbApplications: { $size: '$applications' },
      consumption: 1,
      storage: 1
    }
  }]

  const aggPromise = limits.aggregate(agg).toArray()
  const [count, results] = await Promise.all([limits.countDocuments(query), aggPromise])
  res.send({ count, results })
}))

router.get('/base-applications', asyncWrap(async (req, res) => {
  const baseApps = req.app.get('db').collection('base-applications')
  const [skip, size] = findUtils.pagination(req.query)
  const query = {}
  if (req.query.public) query.public = true
  if (req.query.q) query.$text = { $search: req.query.q }

  const agg = [{
    $match: query
  }, {
    $sort: { public: -1 }
  }, {
    $skip: skip
  }, {
    $limit: size
  }, {
    $lookup: {
      from: 'applications',
      localField: 'url',
      foreignField: 'url',
      as: 'applications'
    }
  }, {
    $project: {
      id: 1,
      title: 1,
      applicationName: 1,
      version: 1,
      description: 1,
      category: 1,
      meta: 1,
      url: 1,
      image: 1,
      deprecated: 1,
      public: 1,
      privateAccess: 1,
      nbApplications: { $size: '$applications' },
      servicesFilters: 1,
      datasetsFilters: 1
    }
  }]

  const aggPromise = baseApps.aggregate(agg).toArray()
  const [count, results] = await Promise.all([baseApps.countDocuments(query), aggPromise])
  for (const result of results) {
    baseAppsUtils.clean(req.publicBaseUrl, result, req.query.thumbnail)
    result.privateAccess = result.privateAccess || []
  }
  res.send({ count, results })
}))
