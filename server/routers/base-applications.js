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
  for (let app of config.applications) {
    try {
      await initBaseApp(db, app)
    } catch (err) {
      console.error(`Failure to initialize base application ${app.url}`, err.message)
    }
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
    let datasetsUrl
    const datasetsItems = configSchema.properties && configSchema.properties.datasets && configSchema.properties.datasets.items
    if (datasetsItems) {
      if (Array.isArray(datasetsItems)) {
        datasetsUrl = datasetsItems[0]['x-fromUrl']
      } else {
        datasetsUrl = datasetsItems['x-fromUrl']
      }
    }
    if (datasetsUrl) {
      const datasetsQuery = url.parse(datasetsUrl, { parseQueryString: true }).query
      patch.datasetsFilter = {}
      if (datasetsQuery.concepts) patch.datasetsFilter.concepts = datasetsQuery.concepts.split(',')
      if (datasetsQuery.bbox === 'true') patch.datasetsFilter.bbox = true
    }

    let servicesUrl
    const servicesItems = configSchema.properties && configSchema.properties.remoteServices && configSchema.properties.remoteServices.items
    if (servicesItems) {
      if (Array.isArray(servicesItems)) {
        servicesUrl = servicesItems[0]['x-fromUrl']
      } else {
        servicesUrl = servicesItems['x-fromUrl']
      }
    }
    if (servicesUrl) {
      const servicesQuery = url.parse(servicesUrl, { parseQueryString: true })
      patch.servicesFilter = {}
      if (servicesQuery['api-id']) patch.servicesFilter['api-id'] = servicesQuery['api-id']
    }
  } catch (err) {
    patch.hasConfigSchema = false
    console.error(`Failed to fetch a config schema for application ${app.url}`, err.message)
  }

  patch.servicesFilter = patch.servicesFilter || {}
  patch.datasetsFilter = patch.datasetsFilter || {}

  const storedBaseApp = (await db.collection('base-applications')
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnOriginal: false })).value
  delete storedBaseApp._id
  return storedBaseApp
}

router.post('', asyncWrap(async(req, res) => {
  if (!req.body.url || Object.keys(req.body).length !== 1) {
    return res.status(400).send('Initializing a base application only accepts the "url" part.')
  }
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
  const countPromise = baseApplications.find(query).count()
  const [results, count] = await Promise.all([findPromise, countPromise])
  res.send({ results, count })
}))
