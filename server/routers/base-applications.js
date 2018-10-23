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

const router = exports.router = express.Router()

// Fill the collection using the default base applications from config
exports.init = async (db) => {
  return Promise.all(config.applications.map(app => failSafeInitBaseApp(db, app)))
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
    title: data.meta.title || '',
    description: data.meta.description || '',
    applicationName: data.meta['application-name'] || '',
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

  if (!patch.hasConfigSchema && !patch.applicationName) {
    throw new Error(`La page à l'adresse ${app.url} ne semble pas héberger une application compatible avec ce service.`)
  }

  patch.servicesFilters = patch.servicesFilters || []
  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnOriginal: false })).value
  delete storedBaseApp._id
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

// Get the list. Non admin users can only see the public ones.
router.get('', asyncWrap(async(req, res) => {
  const baseApplications = req.app.get('db').collection('base-applications')
  if (!(req.user && req.user.isAdmin) && !req.query.public) {
    return res.status(403).send('Non admin users can only see public base applications')
  }
  const query = {}
  if (req.query.public) query.public = true
  const [skip, size] = findUtils.pagination(req.query)
  const findPromise = baseApplications.find(query).limit(size).skip(skip).toArray()
  const countPromise = baseApplications.countDocuments(query)
  const [results, count] = await Promise.all([findPromise, countPromise])
  res.send({ results, count })
}))
