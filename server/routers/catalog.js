const express = require('express')
const createError = require('http-errors')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const datasetUtils = require('../utils/dataset')
const catalogApiDocs = require('../../contract/site-catalog-api-docs')

const router = module.exports = express.Router()

router.use((req, res, next) => {
  if (req.mainPublicationSite) req.publicationSite = req.mainPublicationSite
  if (!req.publicationSite) {
    return next(createError(400, 'catalog API can only be used from a publication site, not the back-office'))
  }
  next()
})

router.get('/datasets', asyncWrap(async (req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  req.resourceType = 'datasets'

  const extraFilters = [{ publicationSites: `${req.publicationSite.type}:${req.publicationSite.id}` }]
  if (req.query.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (req.query.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (req.query.file === 'true') extraFilters.push({ file: { $exists: true } })

  const query = findUtils.query(req, { topics: 'topics.id' }, null, extraFilters)
  const sort = findUtils.sort(req.query.sort || '-createdAt')
  const project = findUtils.project(req.query.select, [], req.query.raw === 'true')
  const [skip, size] = findUtils.pagination(req.query)

  const countPromise = req.query.count !== 'false' && datasets.countDocuments(query)
  const resultsPromise = size > 0 && datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray()
  const [count, results] = await Promise.all([countPromise, resultsPromise])
  for (const result of results) {
    datasetUtils.clean(req.publicBaseUrl, req.publicationSite, result, req.query)
    delete result.publicationSites
    delete result.owner
  }
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []

  res.json(response)
}))

router.get('/api-docs.json', asyncWrap(async (req, res) => {
  const settings = await req.app.get('db').collection('settings')
    .findOne({ type: req.publicationSite.owner.type, id: req.publicationSite.owner.id }, { projection: { info: 1 } })
  res.json(catalogApiDocs(req.publicBaseUrl, req.publicationSite, (settings && settings.info) || {}))
}))
