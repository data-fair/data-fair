const util = require('util')
const url = require('url')
const config = require('config')
const express = require('express')
const axios = require('../utils/axios')
const slug = require('slugify')
const jsonRefs = require('json-refs')
const createError = require('http-errors')
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)
const i18n = require('i18n')
const i18nUtils = require('../utils/i18n')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const baseAppsUtils = require('../utils/base-apps')
const cacheHeaders = require('../utils/cache-headers')
const prometheus = require('../utils/prometheus')
const { getThumbnail } = require('../utils/thumbnails')
const router = exports.router = express.Router()

// Fill the collection using the default base applications from config
// and cleanup non-public apps that are not used anywhere
exports.init = async (db) => {
  await clean(db)
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(db, app)))
}

// Auto removal of deprecated apps used in 0 configs
async function clean (db) {
  const baseApps = await db.collection('base-applications').find({ deprecated: true }).limit(10000).toArray()
  for (const baseApp of baseApps) {
    const nbApps = await db.collection('applications').countDocuments({ url: baseApp.url })
    if (nbApps === 0) await db.collection('base-applications').deleteOne({ id: baseApp.id })
  }
}

function prepareQuery (query) {
  return Object.keys(query)
    .filter(key => !['skip', 'size', 'q', 'status', 'select'].includes(key))
    .reduce((a, key) => { a[key] = query[key].split(','); return a }, {})
}

async function failSafeInitBaseApp (db, app) {
  try {
    await initBaseApp(db, app)
  } catch (err) {
    prometheus.internalError.inc({ errorCode: 'app-init' })
    console.error(`(app-init) Failure to initialize base application ${app.url}`, err.stack)
  }
}

// Attempts to init an application's description from a URL
async function initBaseApp (db, app) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const html = (await axios.get(app.url + 'index.html')).data
  const data = await htmlExtractor.extract(html)
  const patch = {
    meta: data.meta,
    id: slug(app.url, { lower: true }),
    updatedAt: new Date().toISOString(),
    ...app
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true

    // Read the config schema to deduce filters on datasets
    const datasetsDefinition = (configSchema.properties && configSchema.properties.datasets) || (configSchema.allOf && configSchema.allOf[0].properties && configSchema.allOf[0].properties.datasets)
    let datasetsUrls = []
    if (datasetsDefinition) {
      if (datasetsDefinition['x-fromUrl']) datasetsUrls = [datasetsDefinition['x-fromUrl']]
      if (datasetsDefinition.items && datasetsDefinition.items['x-fromUrl']) datasetsUrls = [datasetsDefinition.items['x-fromUrl']]
      if (Array.isArray(datasetsDefinition.items)) datasetsUrls = datasetsDefinition.items.map(item => item['x-fromUrl'])
    }
    const datasetsQueries = datasetsUrls.map(datasetsUrl => url.parse(datasetsUrl, { parseQueryString: true }).query)
    patch.datasetsFilters = datasetsQueries.map(prepareQuery)
  } catch (err) {
    patch.hasConfigSchema = false
    prometheus.internalError.inc({ errorCode: 'app-config-schema' })
    console.error(`(app-config-schema) Failed to fetch a config schema for application ${app.url}`, err.message)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw new Error(i18n.__({ phrase: 'errors.noAppAtUrl', locale: config.i18n.defaultLocale }, { url: app.url }))
  }

  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnDocument: 'after' })).value
  baseAppsUtils.clean(config.publicUrl, storedBaseApp)
  return storedBaseApp
}

router.post('', asyncWrap(async (req, res) => {
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    return res.status(400).send(req.__('Initializing a base application only accepts the "url" part.'))
  }
  const baseApp = config.applications.find(a => a.url === req.body.url) || req.body
  res.send(await initBaseApp(req.app.get('db'), baseApp))
}))

router.patch('/:id', asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  if (!req.user || !req.user.adminMode) return res.status(403).send()
  const patch = req.body
  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: req.params.id }, { $set: patch }, { returnDocument: 'after' })).value
  if (!storedBaseApp) return res.status(404).send()
  res.send(storedBaseApp)
}))

const getQuery = (req, showAll = false) => {
  const query = { $and: [{ deprecated: { $ne: true } }] }
  const accessFilter = []

  accessFilter.push({ public: true })
  // Private access to applications is managed in a similar way as owner filter for
  // other resources (datasets, etc)
  // You can use ?privateAccess=user:alban,organization:koumoul
  const privateAccess = []
  if (req.query.privateAccess) {
    req.query.privateAccess.split(',').forEach(p => {
      const [type, id] = p.split(':')
      if (!req.user) throw createError(401)
      if (!req.user.adminMode) {
        if (type === 'user' && id !== req.user.id) throw createError(403)
        if (type === 'organization' && !req.user.organizations.find(o => o.id === id)) throw createError(403)
      }
      privateAccess.push({ type, id })
      accessFilter.push({ privateAccess: { $elemMatch: { type, id } } })
    })
  }
  if (!showAll) {
    query.$and.push({ $or: accessFilter })
  }
  return { query, privateAccess }
}

// Get the list. Non admin users can only see the public and non deprecated ones.
router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const { query, privateAccess } = getQuery(req)
  if (req.query.applicationName) query.$and.push({ $or: [{ applicationName: req.query.applicationName }, { 'meta.application-name': req.query.applicationName }] })
  if (req.query.q) query.$and.push({ $text: { $search: req.query.q } })

  const [skip, size] = findUtils.pagination(req.query)
  const baseApplications = db.collection('base-applications')
  const findPromise = baseApplications
    .find(query)
    .collation({ locale: 'en' })
    .sort({ title: 1 }).limit(size).skip(skip)
    .toArray()
  const countPromise = baseApplications.countDocuments(query)
  const [results, count] = await Promise.all([findPromise, countPromise])
  for (const result of results) {
    baseAppsUtils.clean(req.publicBaseUrl, result, req.query.thumbnail, req.query.html === 'true')
    // keep only the private access that concerns the current request
    result.privateAccess = (result.privateAccess || []).filter(p => privateAccess.find(p2 => p2.type === p.type && p2.id === p.id))
  }

  // optionally complete informations based on a dataset to guide user in selecting suitable application
  if (req.query.dataset) {
    let datasetBBox, datasetVocabulary, datasetTypes, datasetId, datasetCount
    const vocabulary = i18nUtils.vocabulary[req.locale]
    if (req.query.dataset === 'any') {
      // match constraints against all datasets of current account
      const filter = { 'owner.type': req.user.activeAccount.type, 'owner.id': req.user.activeAccount.id }
      datasetCount = await db.collection('datasets').countDocuments(filter)
      datasetBBox = !!(await db.collection('datasets').countDocuments({ $and: [{ bbox: { $ne: null } }, filter] }))
      const facet = {
        types: [{ $match: { 'schema.x-calculated': { $ne: true } } }, { $group: { _id: { type: '$schema.type' } } }],
        concepts: [{ $group: { _id: { concept: '$schema.x-refersTo' } } }]
      }
      const facetResults = await db.collection('datasets').aggregate([
        { $match: filter },
        { $project: { 'schema.type': 1, 'schema.x-refersTo': 1, 'schema.x-calculated': 1 } },
        { $unwind: '$schema' },
        { $facet: facet }]).toArray()

      datasetTypes = facetResults[0].types.map(t => t._id.type)
      datasetVocabulary = facetResults[0].concepts.map(t => t._id.concept).filter(c => !!c)
    } else {
      // match constraints against a specific dataset
      datasetCount = 1
      datasetId = req.query.dataset
      const dataset = await db.collection('datasets').findOne({ id: datasetId, 'owner.type': req.user.activeAccount.type, 'owner.id': req.user.activeAccount.id })
      if (!dataset) return res.status(404).send(req.__('errors.missingDataset', { id: datasetId }))
      datasetTypes = (dataset.schema || []).filter(field => !field['x-calculated']).map(field => field.type)
      datasetVocabulary = (dataset.schema || []).map(field => field['x-refersTo']).filter(c => !!c)
      datasetBBox = !!dataset.bbox
    }
    for (const application of results) {
      application.disabled = []
      application.category = application.category || 'autre'
      if (datasetId && (!application.datasetsFilters || !application.datasetsFilters.length)) {
        application.disabled.push(req.__('appRequire.noDataset'))
      } else {
        const requirements = []
        if (application.datasetsFilters && application.datasetsFilters.length && !datasetCount) {
          requirements.push(req.__('appRequire.aDataset'))
        } else {
          (application.datasetsFilters || []).forEach(filter => {
            if (filter.bbox && !datasetBBox) {
              requirements.push(req.__('appRequire.geoData'))
            }
            if (filter.concepts) {
              const foundConcepts = []
              filter.concepts.forEach(concept => {
                if (datasetVocabulary.includes(concept)) {
                  foundConcepts.push(concept)
                }
              })
              if (!foundConcepts.length) {
                if (filter.concepts.length === 1) {
                  requirements.push(req.__('appRequire.aConcept', { concept: vocabulary[filter.concepts[0]].title }))
                } else {
                  requirements.push(req.__('appRequire.oneOfConcepts', { concepts: filter.concepts.map(concept => vocabulary[concept].title).join(res.__('appRequire.orJoin')) }))
                }
              }
            }
            if (filter['field-type'] && !datasetTypes.find(t => filter['field-type'].includes(t))) {
              if (filter['field-type'].length === 1) {
                requirements.push(req.__('appRequire.aType', { type: filter['field-type'][0] }))
              } else {
                requirements.push(req.__('appRequire.oneOfTypes', { types: filter['field-type'].join(res.__('appRequire.orJoin')) }))
              }
            }
          })
        }
        if (requirements.length) {
          application.disabled.push(`${req.__('appRequire.requires')}${requirements.join(req.__('appRequire.requiresJoin'))}.`)
        }
      }
    }
  }

  res.send({ count, results })
}))

router.get('/:id/icon', asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const { query } = getQuery(req, req.user.adminMode)
  query.$and.push({ id: req.params.id })
  const baseApp = await db.collection('base-applications').findOne(query, { url: 1 })
  if (!baseApp) return res.status(404).send()
  const iconUrl = baseApp.url.replace(/\/$/, '') + '/icon.png'
  await getThumbnail(req, res, iconUrl)
}))
router.get('/:id/thumbnail', asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const { query } = getQuery(req, req.user.adminMode)
  query.$and.push({ id: req.params.id })
  const baseApp = await db.collection('base-applications').findOne(query, { url: 1 })
  if (!baseApp) return res.status(404).send()
  const imageUrl = baseApp.image || baseApp.url.replace(/\/$/, '') + '/thumbnail.png'
  await getThumbnail(req, res, imageUrl)
}))
