const express = require('express')
const slug = require('slugify')
const moment = require('moment')
const config = /** @type {any} */(require('config'))
const fs = require('fs-extra')
const util = require('util')
const unlink = util.promisify(fs.unlink)
const createError = require('http-errors')
const i18n = require('i18n')
const sanitizeHtml = require('../../shared/sanitize-html')
const { nanoid } = require('nanoid')
const applicationAPIDocs = require('../../contract/application-api-docs')
const ajv = require('../misc/utils/ajv')
const applicationSchema = require('../../contract/application')
const validate = ajv.compile(applicationSchema)
const validateConfiguration = ajv.compile(applicationSchema.properties.configuration)
const applicationPatch = require('../../contract/application-patch')
const validatePatch = ajv.compile(applicationPatch)
const applicationKeys = require('../../contract/application-keys')
const validateKeys = ajv.compile(applicationKeys)

const baseAppsUtils = require('../base-applications/utils')
const permissions = require('../misc/utils/permissions')
const usersUtils = require('../misc/utils/users')
const findUtils = require('../misc/utils/find')
const asyncWrap = require('../misc/utils/async-handler')
const journals = require('../misc/utils/journals')
const capture = require('../misc/utils/capture')
const { clean } = require('./utils')
const { findApplications } = require('./service')
const { syncApplications } = require('../datasets/service')
const cacheHeaders = require('../misc/utils/cache-headers')
const { validateURLFriendly } = require('../misc/utils/validation')
const publicationSites = require('../misc/utils/publication-sites')

const router = module.exports = express.Router()

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'applications'
  next()
})

const setUniqueRefs = (application) => {
  if (application.slug) {
    application._uniqueRefs = [application.id]
    if (application.slug !== application.id) application._uniqueRefs.push(application.slug)
  }
}

const curateApplication = async (db, application) => {
  if (application.title) application.title = application.title.trim()
  const projection = { id: 1, url: 1, meta: 1, datasetsFilters: 1 }
  if (application.url) {
    application.baseApp = await db.collection('base-applications').findOne({ url: application.url }, { projection })
  }
  if (application.urlDraft) {
    application.baseAppDraft = await db.collection('base-applications').findOne({ url: application.urlDraft }, { projection })
  }
  setUniqueRefs(application)
}

// update references to an application into the datasets it references (or used to reference before a patch)
const syncDatasets = async (db, newApp, oldApp = {}) => {
  const ids = [...(newApp?.configuration?.datasets || []), ...(oldApp?.configuration?.datasets || [])]
    .map(dataset => dataset.href.replace(config.publicUrl + '/api/v1/datasets/', ''))
  for (const id of [...new Set(ids)]) {
    await syncApplications(db, id)
  }
}

// Get the list of applications
router.get('', cacheHeaders.listBased, asyncWrap(async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  // @ts-ignore
  const user = req.user
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findApplications(req.app.get('db'), req.locale, publicationSite, publicBaseUrl, reqQuery, user)
  res.json(response)
}))

const initNew = async (req) => {
  const application = { ...req.body }
  application.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  application.createdAt = application.updatedAt = date
  application.createdBy = application.updatedBy = { id: req.user.id, name: req.user.name }
  application.permissions = []
  await curateApplication(req.app.get('db'), application)
  return application
}

// Create an application configuration
router.post('', asyncWrap(async (req, res) => {
  const application = await initNew(req)
  if (!permissions.canDoForOwner(application.owner, 'applications', 'post', req.user)) return res.status(403).type('text/plain').send()
  validate(application)
  validateURLFriendly(i18n.getLocale(req), application.slug)

  // Generate ids and try insertion until there is no conflict on id
  const toks = application.url.split('/').filter(part => !!part)
  const lastUrlPart = toks[toks.length - 1]
  application.id = nanoid()
  const baseslug = application.slug || slug(application.title || application.applicationName || lastUrlPart, { lower: true, strict: true })
  application.slug = baseslug
  setUniqueRefs(application)
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
      application.slug = `${baseslug}-${i}`
      setUniqueRefs(application)
    }
  }
  application.status = 'created'

  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.create', `created application ${application.slug} (${application.id})`, { req, account: application.owner }))

  await journals.log(req.app, application, { type: 'application-created', href: config.publicUrl + '/application/' + application.id }, 'application')
  res.status(201).json(clean(application, req.publicationSite, req.publicBaseUrl))
}))

// Shared middleware
const readApplication = asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite

  const tolerateStale = !!publicationSite
  const application = await findUtils.getByUniqueRef(req.app.get('db'), publicationSite, mainPublicationSite, req.params, 'application', null, tolerateStale)
  if (!application) return res.status(404).send(req.__('errors.missingApp'))

  // @ts-ignore
  req.resourceType = 'applications'
  // @ts-ignore
  req.resource = req.application = application
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
    for (const fd of freshDatasets) {
      updateDates.push(fd.finalizedAt)
    }
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
  res.status(200).send(clean(req.application, req.publicBaseUrl, req.publicationSite, req.query))
})

// PUT used to create or update
const attemptInsert = asyncWrap(async (req, res, next) => {
  const newApplication = await initNew(req)
  newApplication.id = req.params.applicationId

  validate(newApplication)

  permissions.initResourcePermissions(newApplication, req.user)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newApplication.owner, 'applications', 'post', req.user)) {
    try {
      await req.app.get('db').collection('applications').insertOne(newApplication)

      await import('@data-fair/lib/express/events-log.js')
        .then((eventsLog) => eventsLog.default.info('df.applications.create', `created application ${newApplication.slug} (${newApplication.id})`, { req, account: newApplication.owner }))

      req.isNewApplication = true

      await journals.log(req.app, newApplication, { type: 'application-created', href: config.publicUrl + '/application/' + newApplication.id }, 'application')
      return res.status(201).json(clean(newApplication, req.publicBaseUrl, req.publicationSite))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:applicationId', attemptInsert, readApplication, permissions.middleware('writeDescription', 'write'), asyncWrap(async (req, res) => {
  const newApplication = req.body
  // preserve all readonly properties, the rest is overwritten
  for (const key of Object.keys(req.application)) {
    if (!applicationPatch.properties[key]) {
      newApplication[key] = req.application[key]
    }
  }
  newApplication.updatedAt = moment().toISOString()
  newApplication.updatedBy = { id: req.user.id, name: req.user.name }
  newApplication.created = true

  if (!req.isNewApplication) {
    await import('@data-fair/lib/express/events-log.js')
      .then((eventsLog) => eventsLog.default.info('df.applications.update', `updated application ${newApplication.slug} (${newApplication.id})`, { req, account: newApplication.owner }))
  }

  await req.app.get('db').collection('applications').replaceOne({ id: req.params.applicationId }, newApplication)
  res.status(200).json(clean(newApplication, req.publicBaseUrl, req.publicationSite))
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
    validatePatch(patch)
    validateURLFriendly(i18n.getLocale(req), patch.slug)

    // Retry previously failed publications
    if (!patch.publications) {
      const failedPublications = (req.application.publications || []).filter(p => p.status === 'error')
      if (failedPublications.length) {
        for (const p of failedPublications) {
          p.status = 'waiting'
        }
        patch.publications = req.application.publications
      }
    }

    patch.updatedAt = moment().toISOString()
    patch.updatedBy = { id: req.user.id, name: req.user.name }
    patch.id = req.application.id
    patch.slug = patch.slug || req.application.slug
    await curateApplication(db, patch)

    await publicationSites.applyPatch(db, req.application, { ...req.application, ...patch }, req.user, 'application')

    let patchedApplication
    try {
      patchedApplication = (await db.collection('applications')
        .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })).value
    } catch (err) {
      if (err.code !== 11000) throw err
      throw createError(400, req.__('errors.dupSlug'))
    }

    await import('@data-fair/lib/express/events-log.js')
      .then((eventsLog) => eventsLog.default.info('df.applications.patch', `patched application ${patchedApplication.slug} (${patchedApplication.id}), keys=${JSON.stringify(Object.keys(patch))}`, { req, account: patchedApplication.owner }))

    await syncDatasets(db, patchedApplication, req.application)
    res.status(200).json(clean(patchedApplication, req.publicBaseUrl, req.publicationSite))
  }))

// Change ownership of an application
router.put('/:applicationId/owner', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = req.app.get('db')
  // Must be able to delete the current application, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'applications', 'post', req.user)) return res.status(403).type('text/plain').send('Vous ne pouvez pas créer d\'application dans le nouveau propriétaire')

  const patch = {
    owner: req.body,
    updatedBy: { id: req.user.id, name: req.user.name },
    updatedAt: moment().toISOString()
  }
  await permissions.initResourcePermissions(patch)

  const patchedApp = (await db.collection('applications')
    .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })).value

  const eventLogMessage = `changed owner of application ${application.slug} (${application.id}), ${application.owner.name} (${application.owner.type}:${application.owner.id}) -> ${req.body.name} (${req.body.type}:${req.body.id})`
  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.changeOwnerFrom', eventLogMessage, { req, account: application.owner }))
  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.changeOwnerTo', eventLogMessage, { req, account: req.body }))

  await syncDatasets(db, patchedApp)
  res.status(200).json(clean(patchedApp, req.publicBaseUrl, req.publicationSite))
}))

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = req.app.get('db')
  await db.collection('applications').deleteOne({ id: req.params.applicationId })
  await db.collection('journals').deleteOne({ type: 'application', id: req.params.applicationId })
  await db.collection('applications-keys').deleteOne({ _id: application.id })
  try {
    await unlink(await capture.path(application))
  } catch (err) {
    console.warn('Failure to remove capture file')
  }

  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.delete', `deleted application ${application.slug} (${application.id})`, { req, account: application.owner }))

  await syncDatasets(db, req.application)
  res.sendStatus(204)
}))

// Get only the configuration part of the application
const getConfig = (req, res, next) => res.status(200).send(req.application.configuration || {})
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)
router.get('/:applicationId/configuration', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)

// Update only the configuration part of the application
const writeConfig = asyncWrap(async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = req.app.get('db')
  validateConfiguration(req.body)
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

  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.writeConfig', `wrote application config ${application.slug} (${application.id})`, { req, account: application.owner }))

  await journals.log(req.app, application, { type: 'config-updated' }, 'application')
  await syncDatasets(db, { configuration: req.body })
  res.status(200).json(req.body)
})
router.put('/:applicationId/config', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)

// Configuration draft management
router.get('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'read'), cacheHeaders.resourceBased(), (req, res) => {
  res.status(200).send(req.application.configurationDraft || req.application.configuration || {})
})
router.put('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const application = req.application

  validateConfiguration(req.body)
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
  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.validateDraft', `vaidated application config draft ${application.slug} (${application.id})`, { req, account: application.owner }))

  await journals.log(req.app, application, { type: 'config-draft-updated' }, 'application')
  res.status(200).json(req.body)
}))
router.delete('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const application = req.application

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
        status: application.configuration ? 'configured' : 'created'
      }
    }
  )

  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.cancelDraft', `cancelled application config draft ${application.slug} (${application.id})`, { req, account: application.owner }))

  await journals.log(req.app, application, { type: 'config-draft-cancelled' }, 'application')
  res.status(200).json(req.body)
}))

router.get('/:applicationId/base-application', readApplication, permissions.middleware('readBaseApp', 'read'), readBaseApp, cacheHeaders.noCache, asyncWrap(async (req, res) => {
  res.send(baseAppsUtils.clean(req.publicBaseUrl, req.baseApp, req.publicBaseUrl, req.query.html === 'true'))
}))

router.get('/:applicationId/api-docs.json', readApplication, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), asyncWrap(async (req, res) => {
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
  if (!req.body.message) return res.status(400).type('text/plain').send('Attribut "message" obligatoire')

  const referer = req.headers.referer || req.headers.referrer
  const draftMode = referer && referer.includes('draft=true')

  const message = sanitizeHtml(req.body.message)

  if (draftMode) {
    // websocket notifications of draft mode errors
    await req.app.get('db').collection('applications').updateOne({ id: req.application.id }, { $set: { errorMessageDraft: message } })
    await req.app.publish(`applications/${req.params.applicationId}/draft-error`, req.body)
  } else if (req.application.configuration) {
    await req.app.get('db').collection('applications').updateOne({ id: req.application.id }, { $set: { status: 'error', errorMessage: message } })
    await journals.log(req.app, req.application, { type: 'error', data: req.body.message }, 'application')
  }
  res.status(204).send()
}))

router.get('/:applicationId/capture', readApplication, permissions.middleware('readCapture', 'read'), cacheHeaders.resourceBased(), asyncWrap(async (req, res) => {
  await capture.screenshot(req, res)
}))
router.get('/:applicationId/print', readApplication, permissions.middleware('readPrint', 'read'), cacheHeaders.resourceBased(), asyncWrap(async (req, res) => {
  await capture.print(req, res)
}))

// keys for readonly access to application
router.get('/:applicationId/keys', readApplication, permissions.middleware('getKeys', 'admin'), asyncWrap(async (req, res) => {
  const applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ _id: req.application.id })
  res.send((applicationKeys && applicationKeys.keys) || [])
}))
router.post('/:applicationId/keys', readApplication, permissions.middleware('setKeys', 'admin'), asyncWrap(async (req, res) => {
  // @ts-ignore
  const application = req.application

  validateKeys(req.body)
  for (const key of req.body) {
    if (!key.id) key.id = nanoid()
  }
  await req.app.get('db').collection('applications-keys').replaceOne({ _id: application.id }, { _id: application.id, keys: req.body, owner: application.owner }, { upsert: true })

  await import('@data-fair/lib/express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.applications.writeKeys', `wrote application keys ${application.slug} (${application.id})`, { req, account: application.owner }))

  res.send(req.body)
}))
