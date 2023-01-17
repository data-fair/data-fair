const express = require('express')
const slug = require('slugify')
const moment = require('moment')
const config = require('config')
const fs = require('fs-extra')
const util = require('util')
const unlink = util.promisify(fs.unlink)
const sanitizeHtml = require('../../shared/sanitize-html')
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
const publicationSites = require('../utils/publication-sites')
const datasetUtils = require('../utils/dataset')
const { prepareMarkdownContent } = require('../utils/markdown')

const router = module.exports = express.Router()

function clean (application, publicUrl, query = {}) {
  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    if (!select.includes('-public')) application.public = permissions.isPublic('applications', application)
    if (!select.includes('-visibility')) application.visibility = visibilityUtils.visibility(application)
    if (!query.select || select.includes('description')) {
      application.description = application.description || ''
      application.description = prepareMarkdownContent(application.description, query.html === 'true', query.truncate, 'application:' + application.id, application.updatedAt)
    }
    if (!select.includes('-links')) findUtils.setResourceLinks(application, 'application', publicUrl)
  }

  delete application.permissions
  delete application._id
  delete application.configuration
  delete application.configurationDraft
  if (select.includes('-userPermissions')) delete application.userPermissions
  if (select.includes('-owner')) delete application.owner
  return application
}

// update references to an application into the datasets it references (or used to reference before a patch)
const syncDatasets = async (db, newApp, oldApp = {}) => {
  const ids = [...(newApp?.configuration?.datasets || []), ...(oldApp?.configuration?.datasets || [])]
    .map(dataset => dataset.href.replace(config.publicUrl + '/api/v1/datasets/', ''))
  for (const id of [...new Set(ids)]) {
    await datasetUtils.syncApplications(db, id)
  }
}

// Get the list of applications
router.get('', cacheHeaders.listBased, asyncWrap(async (req, res) => {
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
    publicationSites: 'publicationSites',
    requestedPublicationSites: 'requestedPublicationSites'
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
  const [count, results, facets] = await Promise.all([countPromise, resultsPromise, facetsPromise])
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)

  response.results.forEach(r => {
    if (req.query.raw !== 'true') r.userPermissions = permissions.list('applications', r, req.user)
    clean(r, req.publicBaseUrl, req.query)
  })

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
  permissions.initResourcePermissions(application, req.user)
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

const readBaseApp = asyncWrap(async (req, res, next) => {
  req.baseApp = await req.app.get('db').collection('base-applications').findOne({ url: req.application.url })
  if (!req.baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  next()
})

/*
// maybe the idea is ok, but this didn't work great, missing in list mode, etc.
// disabled for now

const setFullUpdatedAt = asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  // the dates of last modification / finalization of both the app, the base-app and the datasets it uses
  const updateDates = [req.application.updatedAt]
  const baseApp = await db.collection('base-applications')
    .findOne({ url: req.application.url }, { projection: { updatedAt: 1, _id: 0 } })
  if (!baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  if (baseApp && baseApp.updatedAt) updateDates.push(baseApp.updatedAt)
  const datasets = req.application.configuration && req.application.configuration.datasets && req.application.configuration.datasets.filter(d => !!d)
  if (datasets && datasets.length) {
    const freshDatasets = await db.collection('datasets')
      .find({ $or: datasets.map(d => ({ id: d.id })) })
      .project({ _id: 0, finalizedAt: 1 })
      .toArray()
    freshDatasets.forEach(fd => updateDates.push(fd.finalizedAt))
  }
  req.application.fullUpdatedAt = updateDates.sort().pop()
  next()
}) */

router.use('/:applicationId/permissions', readApplication, permissions.router('applications', 'application', async (req, patchedApplication) => {
  // this callback function is called when the resource becomes public
  await publicationSites.onPublic(req.app.get('db'), patchedApplication, 'application')
}))

// retrieve a application by its id
router.get('/:applicationId', readApplication, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.application.userPermissions = permissions.list('applications', req.application, req.user)
  res.status(200).send(clean(req.application, req.publicBaseUrl, req.query))
})

// PUT used to create or update
const attemptInsert = asyncWrap(async (req, res, next) => {
  const newApplication = initNew(req)
  newApplication.id = req.params.applicationId

  if (!validate(newApplication)) return res.status(400).send(validate.errors)

  permissions.initResourcePermissions(newApplication, req.user)

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

// Update an application configuration
router.patch('/:applicationId',
  readApplication,
  permissions.middleware('writeDescription', 'write'),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  asyncWrap(async (req, res) => {
    const db = req.app.get('db')
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

    await publicationSites.applyPatch(db, req.application, { ...req.application, ...patch }, req.user, 'application')

    const patchedApplication = (await db.collection('applications')
      .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })).value
    await syncDatasets(db, patchedApplication, req.application)
    res.status(200).json(clean(patchedApplication, req.publicBaseUrl))
  }))

// Change ownership of an application
router.put('/:applicationId/owner', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  // Must be able to delete the current application, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'applications', 'post', req.user)) return res.status(403).send('Vous ne pouvez pas créer d\'application dans le nouveau propriétaire')

  const patch = {
    owner: req.body,
    updatedBy: { id: req.user.id, name: req.user.name },
    updatedAt: moment().toISOString()
  }
  await permissions.initResourcePermissions(patch)

  const patchedApp = (await db.collection('applications')
    .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })).value
  await syncDatasets(db, patchedApp)
  res.status(200).json(clean(patchedApp, req.publicBaseUrl))
}))

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  await db.collection('applications').deleteOne({ id: req.params.applicationId })
  await db.collection('journals').deleteOne({ type: 'application', id: req.params.applicationId })
  await db.collection('applications-keys').deleteOne({ _id: req.application.id })
  try {
    await unlink(await capture.path(req.application))
  } catch (err) {
    console.warn('Failure to remove capture file')
  }
  await syncDatasets(db, req.application)
  res.sendStatus(204)
}))

// Get only the configuration part of the application
const getConfig = (req, res, next) => res.status(200).send(req.application.configuration || {})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased, getConfig)
router.get('/:applicationId/configuration', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased, getConfig)

// Update only the configuration part of the application
const writeConfig = asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const valid = validateConfiguration(req.body)
  if (!valid) return res.status(400).send(validateConfiguration.errors)
  await db.collection('applications').updateOne(
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
  await syncDatasets(db, { configuration: req.body })
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

router.get('/:applicationId/base-application', readApplication, permissions.middleware('readBaseApp', 'read'), readBaseApp, cacheHeaders.noCache, asyncWrap(async (req, res) => {
  res.send(baseAppsUtils.clean(req.baseApp, req.publicBaseUrl, req.query.html === 'true'))
}))

router.get('/:applicationId/api-docs.json', readApplication, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  const settings = await req.app.get('db').collection('settings')
    .findOne({ type: req.application.owner.type, id: req.application.owner.id }, { projection: { info: 1 } })
  res.send(applicationAPIDocs(req.application, (settings && settings.info) || {}))
}))

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
  await capture.screenshot(req, res)
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
