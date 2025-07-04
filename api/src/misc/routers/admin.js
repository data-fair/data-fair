import express from 'express'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import * as status from './status.js'
import * as findUtils from '../utils/find.js'
import * as baseAppsUtils from '../../base-applications/utils.js'
import * as cacheHeaders from '../utils/cache-headers.js'
import mongo from '#mongo'
import { reqAdminMode } from '@data-fair/lib-express'

const router = express.Router()
export default router

// All routes in the router are only for the super admins of the service
router.use(async (req, res, next) => {
  reqAdminMode(req)
  next()
})

router.use(cacheHeaders.noCache)

let info = { version: process.env.NODE_ENV }
router.get('/info', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    info = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../BUILD.json'), 'utf8'))
  }
  res.json(info)
})

router.get('/status', (req, res, next) => {
  status.status(req, res, next)
})

router.get('/datasets-errors', async (req, res, next) => {
  const datasets = mongo.db.collection('datasets')
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
})

router.get('/datasets-es-warnings', async (req, res, next) => {
  const datasets = mongo.db.collection('datasets')
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
})

router.get('/applications-errors', async (req, res, next) => {
  const applications = mongo.db.collection('applications')
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
})

router.get('/applications-draft-errors', async (req, res, next) => {
  const applications = mongo.db.collection('applications')
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
})

router.get('/owners', async (req, res) => {
  const limits = mongo.db.collection('limits')
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
})

router.get('/base-applications', async (req, res) => {
  const baseApps = mongo.db.collection('base-applications')
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
})
