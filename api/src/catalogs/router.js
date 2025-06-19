import config from '#config'
import mongo from '#mongo'
import express from 'express'
import moment from 'moment'
import slug from 'slugify'
import mongoEscape from 'mongo-escape'
import { CronJob } from 'cron'
import catalogAPIDocs from '../../contract/catalog-api-docs.js'
import catalogSchema from '../../contract/catalog.js'
import * as catalogs from './plugins/index.js'
import * as ajv from '../misc/utils/ajv.js'
import catalogPatch from '../../contract/catalog-patch.js'
import * as permissions from '../misc/utils/permissions.ts'
import * as usersUtils from '../misc/utils/users.js'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import { clean } from './utils.js'
import { findCatalogs } from './service.js'
import { reqSession, reqUserAuthenticated } from '@data-fair/lib-express'

const validate = ajv.compile(catalogSchema)
const validatePatch = ajv.compile(catalogPatch)

const router = express.Router()
export default router

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'catalogs'
  next()
})

router.post('/_init', async (req, res) => {
  if (!req.query.url) return res.status(400).type('text/plain').send('"url" query parameter is required')
  const catalog = await catalogs.init(req.query.url)
  if (!catalog) return res.status(400).type('text/plain').send(`Le catalogue à l'url ${req.query.url} est inexistant ou d'un type non supporté.`)
  res.status(200).json(catalog)
})

router.get('/_organizations', cacheHeaders.noCache, async (req, res) => {
  if (!req.query.url) return res.status(400).type('text/plain').send('"url" query parameter is required')
  if (!req.query.type) return res.status(400).type('text/plain').send('"type" query parameter is required')
  if (!req.query.q) return res.status(400).type('text/plain').send('"q" query parameter is required')
  const organizations = await catalogs.searchOrganizations(req.query.type, req.query.url, req.query.q)
  res.status(200).json(organizations)
})

router.get('/_types', cacheHeaders.noCache, async (req, res) => {
  res.send(catalogs.connectors.map(c => ({ key: c.key, title: c.title, optionalCapabilities: c.optionalCapabilities })))
})

// Get the list of catalogs
router.get('', cacheHeaders.noCache, async (req, res) => {
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findCatalogs(mongo.db, req.getLocale(), reqQuery, reqSession(req))
  res.json(response)
})

const initNew = (req) => {
  const catalog = { ...req.body }
  catalog.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  catalog.createdAt = catalog.updatedAt = date
  const user = reqUserAuthenticated(req)
  catalog.createdBy = catalog.updatedBy = { id: user.id, name: user.name }
  catalog.permissions = []
  return catalog
}

// Create a catalog
router.post('', async (req, res) => {
  const catalog = initNew(req)
  if (!permissions.canDoForOwner(catalog.owner, 'catalogs', 'post', reqSession(req))) return res.status(403).type('text/plain').send()
  validate(catalog)

  // Generate ids and try insertion until there is no conflict on id
  const baseId = slug(catalog.url.replace('https://', '').replace('http://', ''), { lower: true, strict: true })
  catalog.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await mongo.db.collection('catalogs').insertOne(mongoEscape.escape(catalog, true))
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      catalog.id = `${baseId}-${i}`
    }
  }

  res.status(201).json(clean(catalog))
})

// Shared middleware
const readCatalog = async (req, res, next) => {
  const catalog = await mongo.db.collection('catalogs')
    .findOne({ id: req.params.catalogId }, { projection: { _id: 0 } })
  if (!catalog) return res.status(404).send('Catalog not found')
  req.catalog = req.resource = mongoEscape.unescape(catalog, true)
  req.resourceType = 'catalogs'
  next()
}

router.use('/:catalogId/permissions', readCatalog, permissions.router('catalogs', 'catalog'))

// retrieve a catalog by its id
router.get('/:catalogId', readCatalog, permissions.middleware('readDescription', 'read'), cacheHeaders.resourceBased(), (req, res, next) => {
  req.catalog.userPermissions = permissions.list('catalogs', req.catalog, reqSession(req))
  res.status(200).send(clean(req.catalog, req.query.html === 'true'))
})

// PUT used to create or update
const attemptInsert = async (req, res, next) => {
  const newCatalog = initNew(req)
  newCatalog.id = req.params.catalogId
  validate(newCatalog)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newCatalog.owner, 'catalogs', 'post', reqSession(req))) {
    try {
      await mongo.db.collection('catalogs').insertOne(mongoEscape.escape(newCatalog, true))
      return res.status(201).json(clean(newCatalog))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
}
router.put('/:catalogId', attemptInsert, readCatalog, permissions.middleware('writeDescription', 'write'), async (req, res) => {
  const newCatalog = req.body
  // preserve all readonly properties, the rest is overwritten
  for (const key of Object.keys(req.catalog)) {
    if (!catalogPatch.properties[key]) newCatalog[key] = req.catalog[key]
  }
  newCatalog.updatedAt = moment().toISOString()
  const user = reqUserAuthenticated(req)
  newCatalog.updatedBy = { id: user.id, name: user.name }
  await mongo.db.collection('catalogs').replaceOne({ id: req.params.catalogId }, mongoEscape.escape(newCatalog, true))
  res.status(200).json(clean(newCatalog))
})

// Update a catalog configuration
router.patch('/:catalogId', readCatalog, permissions.middleware('writeDescription', 'write'), async (req, res) => {
  const patch = req.body
  validatePatch(patch)
  patch.updatedAt = moment().toISOString()
  const user = reqUserAuthenticated(req)
  patch.updatedBy = { id: user.id, name: user.name }

  // manage automatic export of REST datasets into files
  if (patch.autoUpdate) {
    if (patch.autoUpdate.active) {
      const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
      patch.autoUpdate.nextUpdate = job.nextDate().toISO()
    } else {
      delete patch.autoUpdate.nextUpdate
    }
    if (req.catalog.autoUpdate && req.catalog.autoUpdate.lastUpdate) {
      patch.autoUpdate.lastUpdate = req.catalog.autoUpdate.lastUpdate
    }
  }

  const patchedCatalog = await mongo.db.collection('catalogs')
    .findOneAndUpdate({ id: req.params.catalogId }, { $set: mongoEscape.escape(patch, true) }, { returnDocument: 'after' })
  res.status(200).json(clean(mongoEscape.unescape(patchedCatalog)))
})

// Change ownership of a catalog
router.put('/:catalogId/owner', readCatalog, permissions.middleware('delete', 'admin'), async (req, res) => {
  // Must be able to delete the current catalog, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'catalogs', 'post', reqSession(req))) return res.sendStatus(403)
  const patchedCatalog = await mongo.db.collection('catalogs')
    .findOneAndUpdate({ id: req.params.catalogId }, { $set: { owner: req.body } }, { returnDocument: 'after' })
  res.status(200).json(clean(patchedCatalog))
})

// Delete a catalog
router.delete('/:catalogId', readCatalog, permissions.middleware('delete', 'admin'), async (req, res) => {
  await mongo.db.collection('catalogs').deleteOne({ id: req.params.catalogId })
  res.sendStatus(204)
})

router.get('/:catalogId/api-docs.json', readCatalog, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), (req, res) => {
  res.send(catalogAPIDocs(req.catalog))
})

router.get('/:catalogId/datasets', readCatalog, permissions.middleware('readDatasets', 'use'), cacheHeaders.noCache, async (req, res, next) => {
  const datasets = await catalogs.listDatasets(mongo.db, req.catalog, { q: req.query.q })
  res.status(200).json(datasets)
})

router.post('/:catalogId/datasets/:datasetId', readCatalog, permissions.middleware('harvestDataset', 'use'), async (req, res, next) => {
  res.status(201).send(await catalogs.harvestDataset(req.app, req.catalog, req.params.datasetId))
})

router.post('/:catalogId/datasets/:datasetId/resources/:resourceId', readCatalog, permissions.middleware('harvestDatasetResource', 'use'), async (req, res, next) => {
  res.status(201).send(await catalogs.harvestDatasetResource(req.app, req.catalog, req.params.datasetId, req.params.resourceId))
})
