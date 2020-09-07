const util = require('util')
const url = require('url')
const config = require('config')
const express = require('express')
const axios = require('axios')
const slug = require('slugify')
const jsonRefs = require('json-refs')
const createError = require('http-errors')
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)
const vocabularyArray = require('../../contract/vocabulary')
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const baseAppsUtils = require('../utils/base-apps')
const cacheHeaders = require('../utils/cache-headers')
const router = exports.router = express.Router()

const vocabulary = {}
vocabularyArray.forEach(term => { term.identifiers.forEach(id => { vocabulary[id] = term }) })

// Fill the collection using the default base applications from config
// and cleanup non-public apps that are not used anywhere
exports.init = async (db) => {
  await clean(db)
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(db, app)))
}

// Auto removal of deprecated apps used in 0 configs
async function clean(db) {
  const baseApps = await db.collection('base-applications').find({ deprecated: true }).limit(10000).toArray()
  for (const baseApp of baseApps) {
    const nbApps = await db.collection('applications').countDocuments({ url: baseApp.url })
    if (nbApps === 0) await db.collection('base-applications').deleteOne({ id: baseApp.id })
  }
}

function prepareQuery(query) {
  return Object.keys(query)
    .filter(key => !['skip', 'size', 'q', 'status', 'select'].includes(key))
    .reduce((a, key) => { a[key] = query[key].split(','); return a }, {})
}

async function failSafeInitBaseApp(db, app) {
  try {
    await initBaseApp(db, app)
  } catch (err) {
    console.error(`Failure to initialize base application ${app.url}`, err.message)
  }
}

// Attempts to init an application's description from a URL
async function initBaseApp(db, app) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const html = (await axios.get(app.url + 'index.html')).data
  const data = await htmlExtractor.extract(html)
  const patch = {
    meta: data.meta,
    id: slug(app.url, { lower: true }),
    ...app,
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true

    // Read the config schema to deduce filters on datasets
    const datasetsItems = (configSchema.properties && configSchema.properties.datasets && configSchema.properties.datasets.items) ||
      (configSchema.allOf && configSchema.allOf[0].properties && configSchema.allOf[0].properties.datasets && configSchema.allOf[0].properties.datasets.items) ||
      []

    const datasetsUrls = Array.isArray(datasetsItems) ? datasetsItems.map(item => item['x-fromUrl']) : [datasetsItems['x-fromUrl']]
    const datasetsQueries = datasetsUrls.map(datasetsUrl => url.parse(datasetsUrl, { parseQueryString: true }).query)
    patch.datasetsFilters = datasetsQueries.map(prepareQuery)
  } catch (err) {
    patch.hasConfigSchema = false
    console.error(`Failed to fetch a config schema for application ${app.url}`, err.message)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw new Error(`La page à l'adresse ${app.url} ne semble pas héberger une application compatible avec ce service.`)
  }

  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnOriginal: false })).value
  delete storedBaseApp._id
  storedBaseApp.title = storedBaseApp.title || storedBaseApp.meta.title
  storedBaseApp.description = storedBaseApp.description || storedBaseApp.meta.description
  storedBaseApp.category = storedBaseApp.category || storedBaseApp.meta.category
  storedBaseApp.documentation = storedBaseApp.documentation || storedBaseApp.meta.documentation
  return storedBaseApp
}

router.post('', asyncWrap(async(req, res) => {
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    return res.status(400).send('Initializing a base application only accepts the "url" part.')
  }
  const baseApp = config.applications.find(a => a.url === req.body.url) || req.body
  res.send(await initBaseApp(req.app.get('db'), baseApp))
}))

router.patch('/:id', asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  if (!req.user || !req.user.adminMode) return res.status(403).send()
  const patch = req.body
  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: req.params.id }, { $set: patch }, { returnOriginal: false })).value
  if (!storedBaseApp) return res.status(404).send()
  res.send(storedBaseApp)
}))

// Get the list. Non admin users can only see the public and non deprecated ones.
router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const db = req.app.get('db')
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
  query.$and.push({ $or: accessFilter })
  if (req.query.applicationName) query.$and.push({ $or: [{ applicationName: req.query.applicationName }, { 'meta.application-name': req.query.applicationName }] })
  if (req.query.q) query.$and.push({ $text: { $search: req.query.q } })

  const [skip, size] = findUtils.pagination(req.query)
  const baseApplications = db.collection('base-applications')
  const findPromise = baseApplications
    .find(query)
    .sort({ title: 1 }).limit(size).skip(skip)
    .toArray()
  const countPromise = baseApplications.countDocuments(query)
  const [results, count] = await Promise.all([findPromise, countPromise])
  for (const result of results) {
    baseAppsUtils.clean(result, req.query.thumbnail)
    // keep only the private access that concerns the current request
    result.privateAccess = (result.privateAccess || []).filter(p => privateAccess.find(p2 => p2.type === p.type && p2.id === p.id))
  }

  // optionally complete informations based on a dataset to guide user in selecting suitable application
  if (req.query.dataset) {
    let dataset, datasetVocabulary
    if (req.query.dataset !== 'none') {
      dataset = await db.collection('datasets').findOne({ id: req.query.dataset, 'owner.type': req.user.activeAccount.type, 'owner.id': req.user.activeAccount.id })
      if (!dataset) return res.status(404).send(`Jeu de données ${req.query.dataset} est inconnu ou ne vous appartient pas.`)
      datasetVocabulary = (dataset.schema || []).map(field => field['x-refersTo']).filter(c => !!c)
    }
    for (const application of results) {
      application.disabled = []
      application.category = application.category || 'autre'
      if (dataset && (!application.datasetsFilters || !application.datasetsFilters.length)) {
        application.disabled.push('Cette application n\'utilise pas de sources de données de type fichier.')
      } else {
        if (application.datasetsFilters && application.datasetsFilters.length && !dataset) {
          application.disabled.push('Cette application nécessite une source de données.')
        } else {
          (application.datasetsFilters || []).forEach(filter => {
            if (filter.bbox && !dataset.bbox) application.disabled.push('Cette application nécessite une source avec des données géolocalisées.')
            if (filter.concepts) {
              const foundConcepts = []
              filter.concepts.forEach(concept => {
                if (datasetVocabulary.includes(concept)) {
                  foundConcepts.push(concept)
                }
              })
              if (!foundConcepts.length) {
                application.disabled.push(`Cette application nécessite une source avec un champ de concept ${filter.concepts.map(concept => vocabulary[concept].title).join(' ou ')}.`)
              }
            }
            if (filter['field-type'] && (!dataset.schema || !dataset.schema.find(p => filter['field-type'].includes(p.type)))) {
              application.disabled.push(`Cette application nécessite une source avec un champ de type ${filter['field-type'].join(' ou ')}.`)
            }
          })
        }
      }
    }
  }

  res.send({ count, results })
}))
