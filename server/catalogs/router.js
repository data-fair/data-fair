const config = require('config')
const express = require('express')
const moment = require('moment')
const slug = require('slugify')
const i18n = require('i18n')
const mongoEscape = require('mongo-escape')
const CronJob = require('cron').CronJob
const catalogAPIDocs = require('../../contract/catalog-api-docs')
const catalogs = require('./plugins')

const ajv = require('../misc/utils/ajv')
const validate = ajv.compile(require('../../contract/catalog'))
const catalogPatch = require('../../contract/catalog-patch')
const validatePatch = ajv.compile(catalogPatch)

const permissions = require('../misc/utils/permissions')
const usersUtils = require('../misc/utils/users')
const asyncWrap = require('../misc/utils/async-handler')
const cacheHeaders = require('../misc/utils/cache-headers')
const { clean } = require('./utils')
const { findCatalogs } = require('./service')

const router = module.exports = express.Router()

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'catalogs'
  next()
})

router.post('/_init', asyncWrap(async (req, res) => {
  if (!req.query.url) return res.status(400).type('text/plain').send('"url" query parameter is required')
  const catalog = await catalogs.init(req.query.url)
  if (!catalog) return res.status(400).type('text/plain').send(`Le catalogue à l'url ${req.query.url} est inexistant ou d'un type non supporté.`)
  res.status(200).json(catalog)
}))

router.get('/_organizations', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.query.url) return res.status(400).type('text/plain').send('"url" query parameter is required')
  if (!req.query.type) return res.status(400).type('text/plain').send('"type" query parameter is required')
  if (!req.query.q) return res.status(400).type('text/plain').send('"q" query parameter is required')
  const organizations = await catalogs.searchOrganizations(req.query.type, req.query.url, req.query.q)
  res.status(200).json(organizations)
}))

router.get('/_types', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  res.send(catalogs.connectors.map(c => ({ key: c.key, title: c.title, optionalCapabilities: c.optionalCapabilities })))
}))

// Get the list of catalogs
router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  // @ts-ignore
  const user = req.user
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findCatalogs(req.app.get('db'), i18n.getLocale(req), reqQuery, user)
  res.json(response)
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
router.post('', asyncWrap(async (req, res) => {
  const catalog = initNew(req)
  if (!permissions.canDoForOwner(catalog.owner, 'catalogs', 'post', req.user)) return res.status(403).type('text/plain').send()
  validate(catalog)

  // Generate ids and try insertion until there is no conflict on id
  const baseId = slug(catalog.url.replace('https://', '').replace('http://', ''), { lower: true, strict: true })
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

  res.status(201).json(clean(catalog))
}))

// Shared middleware
const readCatalog = asyncWrap(async (req, res, next) => {
  const catalog = await req.app.get('db').collection('catalogs')
    .findOne({ id: req.params.catalogId }, { projection: { _id: 0 } })
  if (!catalog) return res.status(404).send('Catalog not found')
  req.catalog = req.resource = mongoEscape.unescape(catalog, true)
  req.resourceType = 'catalogs'
  next()
})

router.use('/:catalogId/permissions', readCatalog, permissions.router('catalogs', 'catalog'))

// retrieve a catalog by its id
router.get('/:catalogId', readCatalog, permissions.middleware('readDescription', 'read'), cacheHeaders.resourceBased(), (req, res, next) => {
  req.catalog.userPermissions = permissions.list('catalogs', req.catalog, req.user)
  res.status(200).send(clean(req.catalog, req.query.html === 'true'))
})

// PUT used to create or update
const attemptInsert = asyncWrap(async (req, res, next) => {
  const newCatalog = initNew(req)
  newCatalog.id = req.params.catalogId
  validate(newCatalog)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newCatalog.owner, 'catalogs', 'post', req.user)) {
    try {
      await req.app.get('db').collection('catalogs').insertOne(mongoEscape.escape(newCatalog, true))
      return res.status(201).json(clean(newCatalog))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:catalogId', attemptInsert, readCatalog, permissions.middleware('writeDescription', 'write'), asyncWrap(async (req, res) => {
  const newCatalog = req.body
  // preserve all readonly properties, the rest is overwritten
  for (const key of Object.keys(req.catalog)) {
    if (!catalogPatch.properties[key]) newCatalog[key] = req.catalog[key]
  }
  newCatalog.updatedAt = moment().toISOString()
  newCatalog.updatedBy = { id: req.user.id, name: req.user.name }
  await req.app.get('db').collection('catalogs').replaceOne({ id: req.params.catalogId }, mongoEscape.escape(newCatalog, true))
  res.status(200).json(clean(newCatalog))
}))

// Update a catalog configuration
router.patch('/:catalogId', readCatalog, permissions.middleware('writeDescription', 'write'), asyncWrap(async (req, res) => {
  const patch = req.body
  validatePatch(patch)
  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }

  // manage automatic export of REST datasets into files
  if (patch.autoUpdate) {
    if (patch.autoUpdate.active) {
      const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
      patch.autoUpdate.nextUpdate = job.nextDates().toISOString()
    } else {
      delete patch.autoUpdate.nextUpdate
    }
    if (req.catalog.autoUpdate && req.catalog.autoUpdate.lastUpdate) {
      patch.autoUpdate.lastUpdate = req.catalog.autoUpdate.lastUpdate
    }
  }

  const patchedCatalog = (await req.app.get('db').collection('catalogs')
    .findOneAndUpdate({ id: req.params.catalogId }, { $set: mongoEscape.escape(patch, true) }, { returnDocument: 'after' })).value
  res.status(200).json(clean(mongoEscape.unescape(patchedCatalog)))
}))

// Change ownership of a catalog
router.put('/:catalogId/owner', readCatalog, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  // Must be able to delete the current catalog, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'catalogs', 'post', req.user)) return res.sendStatus(403)
  const patchedCatalog = (await req.app.get('db').collection('catalogs')
    .findOneAndUpdate({ id: req.params.catalogId }, { $set: { owner: req.body } }, { returnDocument: 'after' })).value
  res.status(200).json(clean(patchedCatalog))
}))

// Delete a catalog
router.delete('/:catalogId', readCatalog, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  await req.app.get('db').collection('catalogs').deleteOne({ id: req.params.catalogId })
  res.sendStatus(204)
}))

router.get('/:catalogId/api-docs.json', readCatalog, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), (req, res) => {
  res.send(catalogAPIDocs(req.catalog))
})

router.get('/:catalogId/datasets', readCatalog, permissions.middleware('readDatasets', 'use'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  const datasets = await catalogs.listDatasets(req.app.get('db'), req.catalog, { q: req.query.q })
  res.status(200).json(datasets)
}))

router.post('/:catalogId/datasets/:datasetId', readCatalog, permissions.middleware('harvestDataset', 'use'), asyncWrap(async (req, res, next) => {
  res.status(201).send(await catalogs.harvestDataset(req.app, req.catalog, req.params.datasetId))
}))

router.post('/:catalogId/datasets/:datasetId/resources/:resourceId', readCatalog, permissions.middleware('harvestDatasetResource', 'use'), asyncWrap(async (req, res, next) => {
  res.status(201).send(await catalogs.harvestDatasetResource(req.app, req.catalog, req.params.datasetId, req.params.resourceId))
}))
