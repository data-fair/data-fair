const config = require('config')
const express = require('express')
const ajvErrorMessages = require('ajv-error-messages')
const moment = require('moment')
const slug = require('slugify')
const catalogAPIDocs = require('../../contract/catalog-api-docs')
const mongoEscape = require('mongo-escape')
const catalogs = require('../catalogs')

const ajv = require('ajv')()
const validate = ajv.compile(require('../../contract/catalog'))
const catalogPatch = require('../../contract/catalog-patch')
const validatePatch = ajv.compile(catalogPatch)

const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const datasetUtils = require('../utils/dataset')
const clone = require('fast-clone')

const router = module.exports = express.Router()

const operationsClasses = {
  list: ['list'],
  read: ['readDescription'],
  write: ['writeDescription'],
  admin: ['delete', 'getPermissions', 'setPermissions'],
  use: []
}

router.post('/_init', asyncWrap(async(req, res) => {
  if (!req.query.url) return res.status(400).send('"url" query parameter is required')
  const catalog = await catalogs.init(req.query.url)
  if (!catalog) return res.status(400).send(`Le catalogue à l'url ${req.query.url} est inexistant ou d'un type non supporté.`)
  res.status(200).json(catalog)
}))

router.get('/_organizations', asyncWrap(async(req, res) => {
  if (!req.query.url) return res.status(400).send('"url" query parameter is required')
  if (!req.query.type) return res.status(400).send('"type" query parameter is required')
  if (!req.query.q) return res.status(400).send('"q" query parameter is required')
  const organizations = await catalogs.suggestOrganizations(req.query.type, req.query.url, req.query.q)
  res.status(200).json(organizations)
}))

// Get the list of catalogs
router.get('', asyncWrap(async(req, res) => {
  const catalogs = req.app.get('db').collection('catalogs')
  const query = findUtils.query(req, {})
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select)
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? catalogs.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    catalogs.countDocuments(query)
  ]
  if (req.query.facets) {
    const q = clone(query)
    if (req.query.owner) q.$and.pop()
    mongoQueries.push(catalogs.aggregate(findUtils.facetsQuery(req.query.facets, q)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, operationsClasses, req.user)
    r.public = permissions.isPublic(r, operationsClasses)
    delete r.permissions
    if (r.apiKey) r.apiKey = '**********'
    findUtils.setResourceLinks(r, 'catalog')
  })
  facets = findUtils.parseFacets(facets)
  res.json({ results: results.map(result => mongoEscape.unescape(result, true)), count, facets })
}))

const initNew = (req) => {
  const catalog = { ...req.body }
  catalog.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  catalog.createdAt = catalog.updatedAt = date
  catalog.createdBy = catalog.updatedBy = { id: req.user.id, name: req.user.name }
  catalog.permissions = []
  return catalog
}

// Create a catalog
router.post('', asyncWrap(async(req, res) => {
  const catalog = initNew(req)
  if (!permissions.canDoForOwner(catalog.owner, 'postCatalog', req.user, req.app.get('db'))) return res.status(403).send()
  if (!validate(catalog)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Generate ids and try insertion until there is no conflict on id
  const baseId = slug(catalog.url.replace('https://', '').replace('http://', ''), { lower: true })
  catalog.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await req.app.get('db').collection('catalogs').insertOne(mongoEscape.escape(catalog, true))
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      catalog.id = `${baseId}-${i}`
    }
  }

  findUtils.setResourceLinks(catalog, 'catalog')
  res.status(201).json(catalog)
}))

// Shared middleware
const readCatalog = asyncWrap(async(req, res, next) => {
  const catalog = await req.app.get('db').collection('catalogs')
    .findOne({ id: req.params.catalogId }, { projection: { _id: 0 } })
  if (!catalog) return res.status(404).send('Catalog not found')
  findUtils.setResourceLinks(catalog, 'catalog')
  req.catalog = req.resource = mongoEscape.unescape(catalog, true)
  req.resourceApiDoc = catalogAPIDocs(req.catalog)
  next()
})

router.use('/:catalogId/permissions', readCatalog, permissions.router('catalogs', 'catalog'))

// retrieve a catalog by its id
router.get('/:catalogId', readCatalog, permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.catalog.userPermissions = permissions.list(req.catalog, operationsClasses, req.user)
  delete req.catalog.permissions
  if (req.catalog.apiKey) req.catalog.apiKey = '**********'
  res.status(200).send(req.catalog)
})

// PUT used to create or update
const attemptInsert = asyncWrap(async(req, res, next) => {
  const newCatalog = initNew(req)
  newCatalog.id = req.params.catalogId
  if (!validate(newCatalog)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newCatalog.owner, 'postCatalog', req.user, req.app.get('db'))) {
    try {
      await req.app.get('db').collection('catalogs').insertOne(mongoEscape.escape(newCatalog, true))
      findUtils.setResourceLinks(newCatalog, 'catalog')
      return res.status(201).json(newCatalog)
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:catalogId', attemptInsert, readCatalog, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const newCatalog = req.body
  // preserve all readonly properties, the rest is overwritten
  Object.keys(req.catalog).forEach(key => {
    if (!catalogPatch.properties[key]) {
      newCatalog[key] = req.catalog[key]
    }
  })
  newCatalog.updatedAt = moment().toISOString()
  newCatalog.updatedBy = { id: req.user.id, name: req.user.name }
  await req.app.get('db').collection('catalogs').replaceOne({ id: req.params.catalogId }, mongoEscape.escape(newCatalog, true))
  findUtils.setResourceLinks(newCatalog, 'catalog')
  res.status(200).json(newCatalog)
}))

// Update a catalog configuration
router.patch('/:catalogId', readCatalog, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  if (!validatePatch(patch)) return res.status(400).send(ajvErrorMessages(validatePatch.errors))
  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  await req.app.get('db').collection('catalogs').updateOne({ id: req.params.catalogId }, { '$set': mongoEscape.escape(patch, true) })
  res.status(200).json(patch)
}))

// Delete a catalog
router.delete('/:catalogId', readCatalog, permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  await req.app.get('db').collection('catalogs').deleteOne({ id: req.params.catalogId })
  res.sendStatus(204)
}))

router.get('/:catalogId/api-docs.json', readCatalog, permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(req.resourceApiDoc)
})

router.get('/:catalogId/datasets', readCatalog, permissions.middleware('readDatasets', 'read'), asyncWrap(async(req, res, next) => {
  const datasets = await catalogs.listDatasets(req.app.get('db'), req.catalog, { q: req.query.q })
  res.status(200).json(datasets)
}))

router.post('/:catalogId/datasets/:datasetId', readCatalog, permissions.middleware('harvestDataset', 'write'), asyncWrap(async(req, res, next) => {
  await catalogs.harvestDataset(req.catalog, req.params.datasetId, req.app)
  const storageRemaining = await datasetUtils.storageRemaining(req.app.get('db'), req.catalog.owner, req)
  if (storageRemaining !== -1) res.set(config.headers.storedBytesRemaining, storageRemaining)
  res.status(201).send()
}))
