const express = require('express')
const slug = require('slugify')
const moment = require('moment')
const config = require('config')
const fs = require('fs-extra')
const util = require('util')
const unlink = util.promisify(fs.unlink)
const sanitizeHtml = require('../../shared/sanitize-html')
const marked = require('marked')
const { nanoid } = require('nanoid')
const applicationAPIDocs = require('../../contract/application-api-docs')
const ajv = require('ajv')()
const applicationSchema = require('../../contract/application')
const validate = ajv.compile(applicationSchema)
const validateConfiguration = ajv.compile(applicationSchema.properties.configuration)
const applicationPatch = require('../../contract/application-patch')
const validatePatch = ajv.compile(applicationPatch)
const applicationKeys = require('../../contract/application-keys')
const validateKeys = ajv.compile(applicationKeys)

const baseAppsUtils = require('../utils/base-apps')
const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const journals = require('../utils/journals')
const capture = require('../utils/capture')
const visibilityUtils = require('../utils/visibility')
const cacheHeaders = require('../utils/cache-headers')
const { validateId } = require('../utils/validation')

const router = module.exports = express.Router()

function clean (application, publicUrl, html = false) {
  application.public = permissions.isPublic('applications', application)
  application.visibility = visibilityUtils.visibility(application)

  delete application.permissions
  delete application._id
  delete application.configuration
  if (application.description) {
    if (html) application.description = marked.parse(application.description).trim()
    application.description = sanitizeHtml(application.description)
  }
  application.description = application.description ? sanitizeHtml(application.description) : ''
  findUtils.setResourceLinks(application, 'application', publicUrl)
  return application
}

// Get the list of applications
router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
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
  const filterFields = {
    url: 'url',
    'base-application': 'url',
    dataset: 'configuration.datasets.href',
    topics: 'topics.id',
    publicationSites: 'publicationSites'
  }
  const facetFields = {
    ...filterFields,
    topics: 'topics'
  }
  const nullFacetFields = ['publicationSites']
  const query = findUtils.query(req, Object.assign({
    ids: 'id',
    id: 'id'
  }, filterFields))
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['configuration', 'configurationDraft'], req.query.raw === 'true')
  const [skip, size] = findUtils.pagination(req.query)

  const countPromise = req.query.count !== 'false' && applications.countDocuments(query)
  const resultsPromise = size > 0 && applications.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray()
  const facetsPromise = req.query.facets && applications.aggregate(findUtils.facetsQuery(req, facetFields, filterFields, nullFacetFields)).toArray()

  const response = {}
  if (countPromise) response.count = await countPromise
  if (resultsPromise) response.results = await resultsPromise
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(await facetsPromise, nullFacetFields)

  if (req.query.raw !== 'true') {
    response.results.forEach(r => {
      r.userPermissions = permissions.list('applications', r, req.user)
      clean(r, req.publicBaseUrl, req.query.html === 'true')
    })
  }
  res.json(response)
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
router.post('', asyncWrap(async (req, res) => {
  const application = initNew(req)
  if (!permissions.canDoForOwner(application.owner, 'applications', 'post', req.user)) return res.status(403).send()
  if (!validate(application)) return res.status(400).send(validate.errors)
  validateId(application.id)

  // Generate ids and try insertion until there is no conflict on id
  const toks = application.url.split('/').filter(part => !!part)
  const lastUrlPart = toks[toks.length - 1]
  const baseId = application.id || slug(application.title || application.applicationName || lastUrlPart, { lower: true, strict: true })
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
  application.status = 'created'

  await journals.log(req.app, application, { type: 'application-created', href: config.publicUrl + '/application/' + application.id }, 'application')
  res.status(201).json(clean(application, req.publicBaseUrl))
}))

// Shared middleware
const readApplication = asyncWrap(async (req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications')
    .findOne({ id: req.params.applicationId }, { projection: { _id: 0 } })
  if (!req.application) return res.status(404).send(req.__('errors.missingApp'))
  req.resourceType = 'applications'
  next()
})

router.use('/:applicationId/permissions', readApplication, permissions.router('applications', 'application'))

// retrieve a application by its id
router.get('/:applicationId', readApplication, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.application.userPermissions = permissions.list('applications', req.application, req.user)
  res.status(200).send(clean(req.application, req.publicBaseUrl, req.query.html === 'true'))
})

// PUT used to create or update
const attemptInsert = asyncWrap(async (req, res, next) => {
  const newApplication = initNew(req)
  newApplication.id = req.params.applicationId
  if (!validate(newApplication)) return res.status(400).send(validate.errors)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newApplication.owner, 'applications', 'post', req.user)) {
    try {
      await req.app.get('db').collection('applications').insertOne(newApplication)
      await journals.log(req.app, newApplication, { type: 'application-created', href: config.publicUrl + '/application/' + newApplication.id }, 'application')
      return res.status(201).json(clean(newApplication, req.publicBaseUrl))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:applicationId', attemptInsert, readApplication, permissions.middleware('writeDescription', 'write'), asyncWrap(async (req, res) => {
  const newApplication = req.body
  // preserve all readonly properties, the rest is overwritten
  Object.keys(req.application).forEach(key => {
    if (!applicationPatch.properties[key]) {
      newApplication[key] = req.application[key]
    }
  })
  newApplication.updatedAt = moment().toISOString()
  newApplication.updatedBy = { id: req.user.id, name: req.user.name }
  newApplication.created = true
  await req.app.get('db').collection('applications').replaceOne({ id: req.params.applicationId }, newApplication)
  res.status(200).json(clean(newApplication, req.publicBaseUrl))
}))

const permissionsWritePublications = permissions.middleware('writePublications', 'admin')
const permissionsWritePublicationSites = permissions.middleware('writePublicationSites', 'admin')

// Update an application configuration
router.patch('/:applicationId',
  readApplication,
  permissions.middleware('writeDescription', 'write'),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  (req, res, next) => req.body.publicationSites ? permissionsWritePublicationSites(req, res, next) : next(),
  asyncWrap(async (req, res) => {
    const patch = req.body
    const valid = validatePatch(patch)
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
      .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })).value
    res.status(200).json(clean(patchedApplication, req.publicBaseUrl))
  }))

// Change ownership of an application
router.put('/:applicationId/owner', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  // Must be able to delete the current application, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'applications', 'post', req.user)) return res.status(403).send('Vous ne pouvez pas créer d\'application dans le nouveau propriétaire')
  const patchedApp = (await req.app.get('db').collection('applications')
    .findOneAndUpdate({ id: req.params.applicationId }, { $set: { owner: req.body } }, { returnDocument: 'after' })).value
  res.status(200).json(clean(patchedApp, req.publicBaseUrl))
}))

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  await req.app.get('db').collection('applications').deleteOne({ id: req.params.applicationId })
  await req.app.get('db').collection('journals').deleteOne({ type: 'application', id: req.params.applicationId })
  await req.app.get('db').collection('applications-keys').deleteOne({ _id: req.application.id })
  try {
    await unlink(await capture.path(req.application))
  } catch (err) {
    console.warn('Failure to remove capture file')
  }
  res.sendStatus(204)
}))

// Get only the configuration part of the application
const getConfig = (req, res, next) => res.status(200).send(req.application.configuration || {})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased, getConfig)
router.get('/:applicationId/configuration', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased, getConfig)

// Update only the configuration part of the application
const writeConfig = asyncWrap(async (req, res) => {
  const valid = validateConfiguration(req.body)
  if (!valid) return res.status(400).send(validateConfiguration.errors)
  await req.app.get('db').collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        errorMessage: ''
      },
      $set: {
        configuration: req.body,
        updatedAt: moment().toISOString(),
        updatedBy: { id: req.user.id, name: req.user.name },
        lastConfigured: moment().toISOString(),
        status: 'configured'
      }
    }
  )
  await journals.log(req.app, req.application, { type: 'config-updated' }, 'application')
  capture.screenshot(req)
  res.status(200).json(req.body)
})
router.put('/:applicationId/config', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)

// Configuration draft management
router.get('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'read'), cacheHeaders.resourceBased, (req, res) => {
  res.status(200).send(req.application.configurationDraft || req.application.configuration || {})
})
router.put('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), asyncWrap(async (req, res, next) => {
  const valid = validateConfiguration(req.body)
  if (!valid) return res.status(400).send(validateConfiguration.errors)
  await req.app.get('db').collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        errorMessageDraft: ''
      },
      $set: {
        configurationDraft: req.body,
        updatedAt: moment().toISOString(),
        updatedBy: { id: req.user.id, name: req.user.name },
        status: 'configured-draft'
      }
    }
  )
  await journals.log(req.app, req.application, { type: 'config-draft-updated' }, 'application')
  res.status(200).json(req.body)
}))
router.delete('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), asyncWrap(async (req, res, next) => {
  await req.app.get('db').collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        configurationDraft: '',
        errorMessageDraft: ''
      },
      $set: {
        updatedAt: moment().toISOString(),
        updatedBy: { id: req.user.id, name: req.user.name },
        status: req.application.configuration ? 'configured' : 'created'
      }
    }
  )
  await journals.log(req.app, req.application, { type: 'config-draft-cancelled' }, 'application')
  res.status(200).json(req.body)
}))

router.get('/:applicationId/base-application', readApplication, permissions.middleware('readBaseApp', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const baseApplications = db.collection('base-applications')
  const baseApp = await baseApplications.findOne({ url: req.application.url })
  if (!baseApp) return res.status(404).send('No base application matching ' + req.application.url)
  res.send(baseAppsUtils.clean(baseApp, req.publicBaseUrl, req.query.html === 'true'))
}))

router.get('/:applicationId/api-docs.json', readApplication, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased, (req, res) => {
  res.send(applicationAPIDocs(req.application))
})

router.get('/:applicationId/status', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.noCache, (req, res) => {
  res.send(req.application.status)
})

router.get('/:applicationId/journal', readApplication, permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'application',
    id: req.application.id,
    'owner.type': req.application.owner.type,
    'owner.id': req.application.owner.id
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  res.json(journal.events)
}))

// Used by applications to declare an error
router.post('/:applicationId/error', readApplication, permissions.middleware('writeConfig', 'write'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.body.message) return res.status(400).send('Attribut "message" obligatoire')

  const referer = req.headers.referer || req.headers.referrer
  const draftMode = referer && referer.includes('draft=true')

  const message = sanitizeHtml(req.body.message)

  if (draftMode) {
    // websocket notifications of draft mode errors
    await req.app.get('db').collection('applications').updateOne({ id: req.params.applicationId }, { $set: { errorMessageDraft: message } })
    await req.app.publish(`applications/${req.params.applicationId}/draft-error`, req.body)
  } else {
    await req.app.get('db').collection('applications').updateOne({ id: req.params.applicationId }, { $set: { status: 'error', errorMessage: message } })
    await journals.log(req.app, req.application, { type: 'error', data: req.body.message }, 'application')
  }
  res.status(204).send()
}))

router.get('/:applicationId/capture', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  const capturePath = await capture.path(req.application)
  if (await fs.pathExists(capturePath)) {
    res.sendFile(capturePath)
  } else {
    res.redirect(req.publicBaseUrl + '/no-preview.png')
  }
}))

// keys for readonly access to application
router.get('/:applicationId/keys', readApplication, permissions.middleware('getKeys', 'admin'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  const applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ _id: req.application.id })
  res.send((applicationKeys && applicationKeys.keys) || [])
}))
router.post('/:applicationId/keys', readApplication, permissions.middleware('setKeys', 'admin'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  const valid = validateKeys(req.body)
  if (!valid) return res.status(400).send(validateKeys.errors)
  req.body.forEach((key) => {
    if (!key.id) key.id = nanoid()
  })
  await req.app.get('db').collection('applications-keys').replaceOne({ _id: req.application.id }, { _id: req.application.id, keys: req.body, owner: req.application.owner }, { upsert: true })
  res.send(req.body)
}))
