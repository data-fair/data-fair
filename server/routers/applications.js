const express = require('express')
const slug = require('slugify')
const moment = require('moment')
const config = require('config')
const applicationAPIDocs = require('../../contract/application-api-docs')
const ajv = require('ajv')()
const ajvErrorMessages = require('ajv-error-messages')
const applicationSchema = require('../../contract/application')
const validate = ajv.compile(applicationSchema)
const validateConfiguration = ajv.compile(applicationSchema.properties.configuration)
const applicationPatch = require('../../contract/application-patch')
const validatePatch = ajv.compile(applicationPatch)

const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const journals = require('../utils/journals')
const clone = require('fast-clone')

const router = module.exports = express.Router()

const operationsClasses = {
  list: ['list'],
  read: ['readDescription', 'readConfig', 'readApiDoc', 'readJournal'],
  write: ['writeDescription', 'writeConfig'],
  admin: ['delete', 'getPermissions', 'setPermissions']
}

function clean(application) {
  application.public = permissions.isPublic(application, operationsClasses)
  delete application.permissions
  delete application._id
  delete application.configuration
  findUtils.setResourceLinks(application, 'application')
  return application
}

// Get the list of applications
router.get('', asyncWrap(async(req, res) => {
  const applications = req.app.get('db').collection('applications')

  if (req.query.dataset &&
      !req.query.dataset.startsWith('http://') &&
      !req.query.dataset.startsWith('https://')) {
    req.query.dataset = config.publicUrl + '/api/v1/datasets/' + req.query.dataset
  }
  if (req.query.service &&
      !req.query.service.startsWith('http://') &&
      !req.query.service.startsWith('https://')) {
    req.query.service = config.publicUrl + '/api/v1/remote-services/' + req.query.service
  }
  const query = findUtils.query(req, {
    'ids': 'id',
    'id': 'id',
    'url': 'url',
    'dataset': 'configuration.datasets.href',
    'service': 'configuration.remoteServices.href'
  })
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['configuration'])
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? applications.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    applications.countDocuments(query)
  ]
  if (req.query.facets) {
    const q = clone(query)
    if (req.query.owner) {
      q.$and.pop()
      if (!q.$and.length) delete q.$and
    }
    mongoQueries.push(applications.aggregate(findUtils.facetsQuery(req.query.facets, q)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, operationsClasses, req.user)
    clean(r)
  })
  facets = findUtils.parseFacets(facets)
  res.json({ count, results, facets })
}))

const initNew = (req) => {
  const application = { ...req.body }
  application.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  application.createdAt = application.updatedAt = date
  application.createdBy = application.updatedBy = { id: req.user.id, name: req.user.name }
  application.permissions = []
  return application
}

// Create an application configuration
router.post('', asyncWrap(async(req, res) => {
  const application = initNew(req)
  if (!permissions.canDoForOwner(application.owner, 'postApplication', req.user, req.app.get('db'))) return res.status(403).send()
  if (!validate(application)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Generate ids and try insertion until there is no conflict on id
  const toks = application.url.split('/')
  const lastUrlPart = toks[toks.length - 1]
  const baseId = application.id || slug(application.title || application.applicationName || lastUrlPart, { lower: true })
  application.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await req.app.get('db').collection('applications').insertOne(application)
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      application.id = `${baseId}-${i}`
    }
  }

  await journals.log(req.app, application, { type: 'application-created', href: config.publicUrl + '/application/' + application.id }, 'application')
  res.status(201).json(clean(application))
}))

// Shared middleware
const readApplication = asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications')
    .findOne({ id: req.params.applicationId }, { projection: { _id: 0 } })
  if (!req.application) return res.status(404).send('Application configuration not found')
  req.resourceApiDoc = applicationAPIDocs(req.application)
  next()
})

router.use('/:applicationId/permissions', readApplication, permissions.router('applications', 'application'))

// retrieve a application by its id
router.get('/:applicationId', readApplication, permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.application.userPermissions = permissions.list(req.application, operationsClasses, req.user)
  delete req.application.permissions
  delete req.application.configuration
  res.status(200).send(req.application)
})

// PUT used to create or update
const attemptInsert = asyncWrap(async(req, res, next) => {
  const newApplication = initNew(req)
  newApplication.id = req.params.applicationId
  if (!validate(newApplication)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newApplication.owner, 'postApplication', req.user, req.app.get('db'))) {
    try {
      await req.app.get('db').collection('applications').insertOne(newApplication, true)
      await journals.log(req.app, newApplication, { type: 'application-created', href: config.publicUrl + '/application/' + newApplication.id }, 'application')
      return res.status(201).json(clean(newApplication))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:applicationId', attemptInsert, readApplication, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const newApplication = req.body
  // preserve all readonly properties, the rest is overwritten
  Object.keys(req.application).forEach(key => {
    if (!applicationPatch.properties[key]) {
      newApplication[key] = req.application[key]
    }
  })
  newApplication.updatedAt = moment().toISOString()
  newApplication.updatedBy = { id: req.user.id, name: req.user.name }
  await req.app.get('db').collection('applications').replaceOne({ id: req.params.applicationId }, newApplication)
  res.status(200).json(clean(newApplication))
}))

// Update an application configuration
router.patch('/:applicationId', readApplication, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  var valid = validatePatch(patch)
  if (!valid) return res.status(400).send(validatePatch.errors)

  // Retry previously failed publications
  if (!patch.publications) {
    const failedPublications = (req.application.publications || []).filter(p => p.status === 'error')
    if (failedPublications.length) {
      failedPublications.forEach(p => { p.status = 'waiting' })
      patch.publications = req.application.publications
    }
  }

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }

  const patchedApplication = (await req.app.get('db').collection('applications')
    .findOneAndUpdate({ id: req.params.applicationId }, { '$set': patch }, { returnOriginal: false })).value
  res.status(200).json(clean(patchedApplication))
}))

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
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
router.get('/:applicationId/config', readApplication, permissions.middleware('readConfig', 'read'), getConfig)
router.get('/:applicationId/configuration', readApplication, permissions.middleware('readConfig', 'read'), getConfig)

// Update only the configuration part of the application
const writeConfig = asyncWrap(async(req, res) => {
  const valid = validateConfiguration(req.body)
  if (!valid) return res.status(400).send(validateConfiguration.errors)
  await req.app.get('db').collection('applications').updateOne(
    { id: req.params.applicationId },
    { $set: {
      configuration: req.body,
      updatedAt: moment().toISOString(),
      updatedBy: { id: req.user.id, name: req.user.name }
    } }
  )
  await journals.log(req.app, req.application, { type: 'config-updated' }, 'application')
  res.status(200).json(req.body)
})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.put('/:applicationId/config', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)

router.get('/:applicationId/api-docs.json', readApplication, permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(applicationAPIDocs(req.application))
})

router.get('/:applicationId/journal', readApplication, permissions.middleware('readJournal', 'read'), asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'application',
    id: req.params.applicationId
  })
  if (!journal) return res.send([])
  journal.events.reverse()
  res.json(journal.events)
}))
