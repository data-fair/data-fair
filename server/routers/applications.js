const express = require('express')
const slug = require('slug')
const moment = require('moment')
const config = require('config')
const util = require('util')
const axios = require('axios')
const applicationAPIDocs = require('../../contract/application-api-docs')

const ajv = require('ajv')()
const applicationSchema = require('../../contract/application')
const applicationSchemaNoRequired = Object.assign(applicationSchema)
delete applicationSchemaNoRequired.required
const validate = ajv.compile(applicationSchema)
const validateNoRequired = ajv.compile(applicationSchemaNoRequired)
const validateConfiguration = ajv.compile(applicationSchema.properties.configuration)
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)

const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const journals = require('../utils/journals')

const router = module.exports = express.Router()

const operationsClasses = {
  list: ['list'],
  read: ['readDescription', 'readConfig', 'readApiDoc', 'readJournal'],
  write: ['writeDescription', 'writeConfig'],
  admin: ['delete', 'getPermissions', 'setPermissions']
}

// Attempts to init an application's description from a URL
router.get('/_description', asyncWrap(async(req, res) => {
  if (!req.query.url) return res.status(400).send('"url" query parameter is required')
  const html = (await axios.get(req.query.url)).data
  const data = await htmlExtractor.extract(html)
  res.send({
    title: data.meta.title,
    description: data.meta.description,
    applicationName: data.meta['application-name']
  })
}))

// Get the list of applications
router.get('', asyncWrap(async(req, res) => {
  if (!req.user && (req.query['is-owner'] === 'true')) {
    return res.json({
      results: [],
      count: 0
    })
  }

  const applications = req.app.get('db').collection('applications')

  if (req.query.dataset &&
      !req.query.dataset.startsWith('http://') &&
      !req.query.dataset.startsWith('https://')) {
    req.query.dataset = config.publicUrl + '/api/v1/datasets/' + req.query.dataset
  }
  if (req.query.service &&
      !req.query.service.startsWith('http://') &&
      !req.query.service.startsWith('https://')) {
    req.query.service = config.publicUrl + '/api/v1/remote-services/' + req.query.service + '/proxy'
  }
  const query = findUtils.query(req.query, {
    'ids': 'id',
    'dataset': 'configuration.datasets.href',
    'service': 'configuration.remoteServices.href'
  })
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['configuration'])
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user, !(req.query['is-owner'] === 'true'))
  let mongoQueries = [
    size > 0 ? applications.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    applications.find(query).count()
  ]
  let [results, count] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, operationsClasses, req.user)
    r.public = permissions.isPublic(r, operationsClasses)
    delete r.permissions
    findUtils.setResourceLinks(r, 'application')
  })
  res.json({results, count})
}))

// Create an application configuration
router.post('', asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  const application = req.body
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  if (!application.url) return res.sendStatus(400)
  const toks = application.url.split('/')
  const lastUrlPart = toks[toks.length - 1]
  const baseId = application.id || slug(application.applicationName || application.title || lastUrlPart, {lower: true})
  application.id = baseId
  let i = 1
  do {
    if (i > 1) application.id = baseId + i
    var dbExists = await req.app.get('db').collection('applications').count({id: application.id})
    i += 1
  } while (dbExists)
  application.owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(application.owner, 'postApplication', req.user, req.app.get('db'))) return res.sendStatus(403)
  var valid = validate(application)
  if (!valid) return res.status(400).send(validate.errors)
  const date = moment().toISOString()
  application.createdAt = date
  application.createdBy = {id: req.user.id, name: req.user.name}
  application.updatedAt = date
  application.updatedBy = {id: req.user.id, name: req.user.name}

  application.permissions = []

  // Make sure the creator can work on the resource he just created
  // even if he created it in an organization
  if (application.owner.type === 'organization') {
    application.permissions.push({
      type: 'user',
      id: req.user.id,
      name: req.user.name,
      classes: ['list', 'read', 'write', 'admin']
    })
  }

  await req.app.get('db').collection('applications').insertOne(application)
  await journals.log(req.app, application, {type: 'application-created', href: config.publicUrl + '/application/' + application.id}, 'application')
  res.status(201).json(application)
}))

// Middlewares
router.use('/:applicationId', asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications').findOne({
    id: req.params.applicationId
  }, {
    fields: {
      _id: 0
    }
  })
  if (!req.application) return res.status(404).send('Application configuration not found')
  findUtils.setResourceLinks(req.application, 'application')
  req.resourceApiDoc = applicationAPIDocs(req.application)
  next()
}))

router.use('/:applicationId/permissions', permissions.router('applications', 'application'))

// retrieve a application by its id
router.get('/:applicationId', permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.application.userPermissions = permissions.list(req.application, operationsClasses, req.user)
  delete req.application.permissions
  delete req.application.configuration
  res.status(200).send(req.application)
})

// Update an application configuration
const patchKeys = ['configuration', 'url', 'description', 'title', 'publications']
router.patch('/:applicationId', permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  var valid = validateNoRequired(patch)
  if (!valid) return res.status(400).send(validateNoRequired.errors)

  const forbiddenKey = Object.keys(req.body).find(key => !patchKeys.includes(key))
  if (forbiddenKey) return res.status(400).send('Only some parts of the application configuration can be modified through this route')

  // Retry previously failed publications
  if (!patch.publications) {
    const failedPublications = (req.application.publications || []).filter(p => p.status === 'error')
    if (failedPublications.length) {
      failedPublications.forEach(p => { p.status = 'waiting' })
      patch.publications = req.application.publications
    }
  }

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = {id: req.user.id, name: req.user.name}

  await req.app.get('db').collection('applications').updateOne({id: req.params.applicationId}, {'$set': patch})
  res.status(200).json(patch)
}))

// Delete an application configuration
router.delete('/:applicationId', permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  await req.app.get('db').collection('applications').deleteOne({
    id: req.params.applicationId
  })
  await req.app.get('db').collection('journals').deleteOne({
    type: 'application',
    id: req.params.applicationId
  })
  res.sendStatus(204)
}))

// Get only the configuration part of the application
const getConfig = (req, res, next) => res.status(200).send(req.application.configuration || {})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', permissions.middleware('readConfig', 'read'), getConfig)
router.get('/:applicationId/configuration', permissions.middleware('readConfig', 'read'), getConfig)

// Update only the configuration part of the application
const writeConfig = asyncWrap(async(req, res) => {
  const valid = validateConfiguration(req.body)
  if (!valid) return res.status(400).send(validateConfiguration.errors)
  await req.app.get('db').collection('applications').updateOne(
    {id: req.params.applicationId},
    {$set: {configuration: req.body}}
  )
  await journals.log(req.app, req.application, {type: 'config-updated'}, 'application')
  res.status(200).json(req.body)
})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.put('/:applicationId/config', permissions.middleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', permissions.middleware('writeConfig', 'write'), writeConfig)

router.get('/:applicationId/api-docs.json', permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(applicationAPIDocs(req.application))
})

router.get('/:applicationId/journal', permissions.middleware('readJournal', 'read'), asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'application',
    id: req.params.applicationId
  })
  if (!journal) return res.send([])
  journal.events.reverse()
  res.json(journal.events)
}))
