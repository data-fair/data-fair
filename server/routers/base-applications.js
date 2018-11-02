const util = require('util')
const url = require('url')
const config = require('config')
const express = require('express')
const axios = require('axios')
const slug = require('slugify')
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)
const asyncWrap = require('../utils/async-wrap')
const findUtils = require('../utils/find')
const thumbor = require('../utils/thumbor')
const router = exports.router = express.Router()

// Fill the collection using the default base applications from config
// and cleanup non-public apps that are not used anywhere
exports.init = async (db) => {
  await clean(db)
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(db, app)))
}

async function clean(db) {
  const baseApps = await db.collection('base-applications').find({ public: { $ne: true } }).limit(10000).toArray()
  for (let baseApp of baseApps) {
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
  const html = (await axios.get(app.url)).data
  const data = await htmlExtractor.extract(html)
  const patch = {
    meta: data.meta,
    id: slug(app.url, { lower: true }),
    ...app
  }

  try {
    const configSchema = (await axios.get(app.url + '/config-schema.json')).data
    if (typeof configSchema !== 'object') throw new Error('Invalid json')
    patch.hasConfigSchema = true

    // Read the config schema to deduce filters on datasets and remoteServices
    const datasetsItems = (configSchema.properties && configSchema.properties.datasets && configSchema.properties.datasets.items) || []
    const datasetsUrls = Array.isArray(datasetsItems) ? datasetsItems.map(item => item['x-fromUrl']) : [datasetsItems['x-fromUrl']]
    const datasetsQueries = datasetsUrls.map(datasetsUrl => url.parse(datasetsUrl, { parseQueryString: true }).query)
    patch.datasetsFilters = datasetsQueries.map(prepareQuery)

    const servicesItems = (configSchema.properties && configSchema.properties.remoteServices && configSchema.properties.remoteServices.items) || []
    const servicesUrls = Array.isArray(servicesItems) ? servicesItems.map(item => item['x-fromUrl']) : [servicesItems['x-fromUrl']]
    const servicesQueries = servicesUrls.map(servicesUrl => url.parse(servicesUrl, { parseQueryString: true }).query)
    patch.servicesFilters = servicesQueries.map(prepareQuery)
  } catch (err) {
    patch.hasConfigSchema = false
    console.error(`Failed to fetch a config schema for application ${app.url}`, err.message)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw new Error(`La page à l'adresse ${app.url} ne semble pas héberger une application compatible avec ce service.`)
  }

  patch.servicesFilters = patch.servicesFilters || []
  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnOriginal: false })).value
  delete storedBaseApp._id
  storedBaseApp.title = storedBaseApp.title || storedBaseApp.meta.title
  storedBaseApp.description = storedBaseApp.description || storedBaseApp.meta.description
  return storedBaseApp
}

router.post('', asyncWrap(async(req, res) => {
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    return res.status(400).send('Initializing a base application only accepts the "url" part.')
  }
  if (req.body.url[req.body.url.length - 1] !== '/') req.body.url += '/'
  const defaultApp = config.applications.find(a => a.url === req.body.url)
  res.send(await initBaseApp(req.app.get('db'), defaultApp || req.body))
}))

router.patch('/:id', asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  if (!req.user || !req.user.isAdmin) return res.status(403).send()
  const patch = req.body
  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: req.params.id }, { $set: patch }, { returnOriginal: false })).value
  if (!storedBaseApp) return res.status(404).send()
  res.send(storedBaseApp)
}))

// Get the list. Non admin users can only see the public ones.
router.get('', asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  if (!(req.user && req.user.isAdmin) && !req.query.public) {
    return res.status(403).send('Non admin users can only see public base applications')
  }
  const query = {}
  if (req.query.public) query.public = true
  if (req.query.q) query.$text = { $search: req.query.q }
  const [skip, size] = findUtils.pagination(req.query)
  const baseApplications = db.collection('base-applications')
  const findPromise = baseApplications.find(query).sort({ title: 1 }).limit(size).skip(skip).toArray()
  const countPromise = baseApplications.countDocuments(query)
  const [results, count] = await Promise.all([findPromise, countPromise])
  for (let result of results) {
    result.title = result.title || result.meta.title
    result.description = result.description || result.meta.description
    result.image = result.image || result.url + 'thumbnail.png'
    result.thumbnail = thumbor.thumbnail(result.image, req.query.thumbnail || '300x200')
  }
  res.send({ count, results })
}))
