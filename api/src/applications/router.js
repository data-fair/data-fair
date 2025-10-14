import path from 'path'
import express from 'express'
import slug from 'slugify'
import moment from 'moment'
import config from '#config'
import mongo from '#mongo'
import fs from 'fs-extra'
import util from 'util'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import { nanoid } from 'nanoid'
import contentDisposition from 'content-disposition'
import applicationAPIDocs from '../../contract/application-api-docs.js'
import * as ajv from '../misc/utils/ajv.ts'
import applicationKeys from '../../contract/application-keys.js'
import * as baseAppsUtils from '../base-applications/utils.js'
import * as permissions from '../misc/utils/permissions.ts'
import * as usersUtils from '../misc/utils/users.ts'
import * as findUtils from '../misc/utils/find.js'
import * as journals from '../misc/utils/journals.ts'
import * as capture from '../misc/utils/capture.ts'
import { clean, refreshConfigDatasetsRefs, updateStorage, attachmentPath, attachmentsDir, dir } from './utils.ts'
import { findApplications } from './service.js'
import { syncApplications } from '../datasets/service.js'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import * as publicationSites from '../misc/utils/publication-sites.ts'
import { checkStorage } from '../datasets/middlewares.js'
import * as attachments from '../misc/utils/attachments.js'
import * as clamav from '../misc/utils/clamav.ts'
import { getThumbnail } from '../misc/utils/thumbnails.js'
import pump from '../misc/utils/pipe.ts'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import { patchKeys } from '#doc/applications/patch-req/schema.js'
import { reqSession, reqSessionAuthenticated, reqUserAuthenticated, session } from '@data-fair/lib-express'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { sendResourceEvent } from '../misc/utils/notifications.ts'

const unlink = util.promisify(fs.unlink)
const validateKeys = ajv.compile(applicationKeys)

const router = express.Router()
export default router

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

const curateApplication = async (application) => {
  if (application.title) application.title = application.title.trim()
  const projection = { id: 1, url: 1, meta: 1, datasetsFilters: 1 }
  if (application.url) {
    application.baseApp = await mongo.baseApplications.findOne({ url: application.url }, { projection })
    if (!application.baseApp) {
      throw httpError(400, 'Base application not found')
    }
  } else {
    delete application.baseApp
  }
  if (application.urlDraft) {
    application.baseAppDraft = await mongo.baseApplications.findOne({ url: application.urlDraft }, { projection })
    if (!application.baseAppDraft) {
      throw httpError(400, 'Base draft application not found')
    }
  } else {
    delete application.baseAppDraft
  }
  setUniqueRefs(application)
}

// update references to an application into the datasets it references (or used to reference before a patch)
const syncDatasets = async (newApp, oldApp = {}) => {
  const ids = [...(newApp?.configuration?.datasets || []), ...(oldApp?.configuration?.datasets || [])]
    .map(dataset => dataset.href.replace(config.publicUrl + '/api/v1/datasets/', ''))
  for (const id of [...new Set(ids)]) {
    await syncApplications(id)
  }
}

// Get the list of applications
router.get('', cacheHeaders.listBased, async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findApplications(req.getLocale(), publicationSite, publicBaseUrl, reqQuery, reqSession(req))
  res.json(response)
})

const initNew = async (req, id) => {
  const application = { ...req.body }
  if (id) application.id = id
  application.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  application.createdAt = application.updatedAt = date
  const user = reqUserAuthenticated(req)
  application.createdBy = application.updatedBy = { id: user.id, name: user.name }
  application.permissions = []
  await curateApplication(application)
  return application
}

// Create an application configuration
router.post('', async (req, res) => {
  const sessionState = reqSession(req)
  const application = await initNew((await import('#doc/applications/post-req/index.js')).returnValid(req))
  if (!permissions.canDoForOwner(application.owner, 'applications', 'post', sessionState)) return res.status(403).type('text/plain').send()

  application.id = nanoid()

  if (application.initFrom) {
    const parentApplication = await mongo.applications.findOne({ id: application.initFrom.application })
    if (!parentApplication) throw new Error('[noretry] application d\'initialisation inconnue ' + application.initFrom.application)
    const parentApplicationPermissions = permissions.list('applications', parentApplication, sessionState)
    if (!parentApplicationPermissions.includes('readDescription')) {
      throw new Error(`[noretry] permission manquante sur l'application d'initialisation "${parentApplication.slug}" (${parentApplication.id})`)
    }
    if (parentApplication.url !== application.url) throw httpError(400, 'application.url and initFrom application do not match')
    application.configuration = parentApplication.configuration
    if (parentApplication.summary) application.summary = parentApplication.summary
    if (parentApplication.description) application.description = parentApplication.description
    if (parentApplication.attachments?.length) {
      for (const attachment of parentApplication.attachments) {
        const newPath = attachmentPath(application, attachment.name)
        await fs.ensureDir(path.dirname(newPath))
        await fs.copyFile(attachmentPath(parentApplication, attachment.name), newPath)
      }
      application.attachments = parentApplication.attachments
    }
  }

  // Generate ids and try insertion until there is no conflict on id
  const toks = application.url.split('/').filter(part => !!part)
  const lastUrlPart = toks[toks.length - 1]
  application.title = application.title || application.applicationName || lastUrlPart
  const baseslug = application.slug || slug(application.title, { lower: true, strict: true })
  application.slug = baseslug
  setUniqueRefs(application)
  permissions.initResourcePermissions(application)
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await mongo.db.collection('applications').insertOne(application)
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      application.slug = `${baseslug}-${i}`
      setUniqueRefs(application)
    }
  }
  application.status = 'created'

  eventsLog.info('df.applications.create', `created application ${application.slug} (${application.id})`, { req, account: application.owner })

  await journals.log('applications', application, { type: 'application-created', href: config.publicUrl + '/application/' + application.id })
  await sendResourceEvent('applications', application, sessionState, 'application-created')
  res.status(201).json(clean(application, req.publicationSite, req.publicBaseUrl))
})

// Shared middleware
const readApplication = async (req, res, next) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const mainPublicationSite = req.mainPublicationSite

  const tolerateStale = !!publicationSite
  const application = await findUtils.getByUniqueRef(publicationSite, mainPublicationSite, req.params, 'application', null, tolerateStale)
  if (!application) return res.status(404).send(req.__('errors.missingApp'))

  // @ts-ignore
  req.resourceType = 'applications'
  // @ts-ignore
  req.resource = req.application = application
  next()
}

const readBaseApp = async (req, res, next) => {
  req.baseApp = await mongo.db.collection('base-applications').findOne({ url: req.application.url })
  if (!req.baseApp) return res.status(404).send(req.__('errors.missingBaseApp'))
  baseAppsUtils.clean(req.publicBaseUrl, req.baseApp)
  next()
}

/*
// maybe the idea is ok, but this didn't work great, missing in list mode, etc.
// disabled for now

const setFullUpdatedAt = async (req, res, next) => {
  const db = mongo.db
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
} */

router.use('/:applicationId/permissions', readApplication, permissions.router('applications', 'application', async (req, patchedApplication) => {
  // this callback function is called when the resource becomes public
  await publicationSites.onPublic(patchedApplication, 'applications', reqSessionAuthenticated(req))
}))

// retrieve a application by its id
router.get('/:applicationId', readApplication, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.application.userPermissions = permissions.list('applications', req.application, reqSession(req))
  res.status(200).send(clean(req.application, req.publicBaseUrl, req.publicationSite, req.query))
})

// PUT used to create or update
const attemptInsert = async (req, res, next) => {
  const { returnValid } = await import('#types/application/index.js')
  const newApplication = returnValid(await initNew(req, req.params.applicationId))
  const sessionState = reqSession(req)

  permissions.initResourcePermissions(newApplication)

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newApplication.owner, 'applications', 'post', sessionState)) {
    try {
      await mongo.db.collection('applications').insertOne(newApplication)

      eventsLog.info('df.applications.create', `created application ${newApplication.slug} (${newApplication.id})`, { req, account: newApplication.owner })

      req.isNewApplication = true

      await journals.log('applications', newApplication, { type: 'application-created', href: config.publicUrl + '/application/' + newApplication.id })
      await sendResourceEvent('applications', newApplication, sessionState, 'application-created')

      return res.status(201).json(clean(newApplication, req.publicBaseUrl, req.publicationSite))
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
}
router.put('/:applicationId', attemptInsert, readApplication, permissions.middleware('writeDescription', 'write'), async (req, res) => {
  const newApplication = req.body
  // preserve all readonly properties, the rest is overwritten
  for (const key of Object.keys(req.application)) {
    if (!patchKeys.includes([key])) {
      newApplication[key] = req.application[key]
    }
  }
  newApplication.updatedAt = moment().toISOString()
  const user = reqUserAuthenticated(req)
  newApplication.updatedBy = { id: user.id, name: user.name }
  newApplication.created = true

  if (!req.isNewApplication) {
    eventsLog.info('df.applications.update', `updated application ${newApplication.slug} (${newApplication.id})`, { req, account: newApplication.owner })
    const sessionState = await session.req(req)
    eventsQueue.pushEvent({
      title: 'Application entièrement modifiée',
      body: `${newApplication.title} (${newApplication.slug})`,
      topic: {
        key: `data-fair:application-updated:${newApplication.id}`
      },
      sender: newApplication.owner,
      resource: { type: 'application', title: newApplication.title, id: newApplication.id }
    }, sessionState)
  }

  await mongo.db.collection('applications').replaceOne({ id: req.params.applicationId }, newApplication)
  res.status(200).json(clean(newApplication, req.publicBaseUrl, req.publicationSite))
})

const permissionsWritePublications = permissions.middleware('writePublications', 'admin')

// Update an application configuration
router.patch('/:applicationId',
  readApplication,
  permissions.middleware('writeDescription', 'write'),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  async (req, res) => {
    const db = mongo.db
    // @ts-ignore
    const application = req.application
    const { body: patch } = (await import('#doc/applications/patch-req/index.js')).returnValid(req)

    // Retry previously failed publications
    if (!patch.publications) {
      const failedPublications = (application.publications || []).filter(p => p.status === 'error')
      if (failedPublications.length) {
        for (const p of failedPublications) {
          p.status = 'waiting'
        }
        patch.publications = application.publications
      }
    }

    patch.updatedAt = moment().toISOString()
    const user = reqUserAuthenticated(req)
    patch.updatedBy = { id: user.id, name: user.name }
    patch.id = application.id
    patch.slug = patch.slug || application.slug
    await curateApplication(patch)

    await publicationSites.applyPatch(application, { ...application, ...patch }, reqSession(req), 'applications')

    let patchedApplication
    try {
      patchedApplication = await db.collection('applications')
        .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })
    } catch (err) {
      if (err.code !== 11000) throw err
      throw httpError(400, req.__('errors.dupSlug'))
    }

    eventsLog.info('df.applications.patch', `patched application ${patchedApplication.slug} (${patchedApplication.id}), keys=${JSON.stringify(Object.keys(patch))}`, { req, account: patchedApplication.owner })

    const sessionState = await session.req(req)
    eventsQueue.pushEvent({
      title: 'Propriétés modifiées sur une application',
      body: `${application.title} (${application.slug}), ${Object.keys(patch)?.join(', ')}`,
      topic: {
        key: `data-fair:application-patched-properties:${application.id}`
      },
      sender: application.owner,
      resource: { type: 'application', title: application.title, id: application.id }
    }, sessionState)

    await syncDatasets(patchedApplication, application)
    res.status(200).json(clean(patchedApplication, req.publicBaseUrl, req.publicationSite))
  }
)

// Change ownership of an application
router.put('/:applicationId/owner', readApplication, permissions.middleware('delete', 'admin'), async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = mongo.db
  const sessionState = reqSessionAuthenticated(req)

  // Must be able to delete the current application, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'applications', 'post', sessionState)) return res.status(403).type('text/plain').send('Vous ne pouvez pas créer d\'application dans le nouveau propriétaire')

  const patch = {
    owner: req.body,
    updatedBy: { id: sessionState.user.id, name: sessionState.user.name },
    updatedAt: moment().toISOString()
  }
  const sameOrg = application.owner.type === 'organization' && application.owner.type === req.body.type && application.owner.id === req.body.id
  if (sameOrg && !application.owner.department && req.body.department) {
    // moving from org root to a department, we keep the publicationSites
  } else {
    patch.publicationSites = []
  }
  if (!sameOrg && req.body.publications) {
    patch.publications = []
  }

  const preservePermissions = (application.permissions || []).filter(p => {
    // keep public permissions
    if (!p.type) return true
    if (sameOrg) {
      // keep individual user permissions (user partners)
      if (p.type === 'user') return true
      // keep permissions to external org (org partners)
      if (p.type === 'organization' && p.id !== application.owner.id) return true
    }
    return false
  })
  await permissions.initResourcePermissions(patch, preservePermissions)

  const patchedApp = await db.collection('applications')
    .findOneAndUpdate({ id: req.params.applicationId }, { $set: patch }, { returnDocument: 'after' })

  const arrowStr = `${application.owner.name} (${application.owner.type}:${application.owner.id}) -> ${patch.owner.name} (${patch.owner.type}:${patch.owner.id})`
  const eventLogMessage = `changed owner of application ${application.slug} (${application.id}), ${arrowStr}`
  eventsLog.info('df.applications.changeOwnerFrom', eventLogMessage, { req, account: application.owner })
  eventsLog.info('df.applications.changeOwnerTo', eventLogMessage, { req, account: req.body })

  const event = {
    title: 'Changement de propriétaire d\'une application',
    body: `${application.title} (${application.slug}), ${arrowStr}`,
    topic: {
      key: `data-fair:application-change-owner:${application.id}`
    },
    resource: { type: 'application', title: application.title, id: application.id },
    sender: { ...application.owner, role: 'admin' }
  }
  eventsQueue.pushEvent(event, sessionState)
  eventsQueue.pushEvent({ ...event, sender: { ...patch.owner, admin: true } }, sessionState)

  await syncDatasets(patchedApp)
  res.status(200).json(clean(patchedApp, req.publicBaseUrl, req.publicationSite))
})

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissions.middleware('delete', 'admin'), async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = mongo.db
  await db.collection('applications').deleteOne({ id: req.params.applicationId })
  await db.collection('journals').deleteOne({ type: 'application', id: req.params.applicationId })
  await db.collection('applications-keys').deleteOne({ _id: application.id })
  try {
    await unlink(await capture.path(application))
  } catch (err) {
    console.warn('Failure to remove capture file')
  }
  try {
    await fs.remove(dir(application))
  } catch (err) {
    console.warn('Failure to remove application directory')
  }

  eventsLog.info('df.applications.delete', `deleted application ${application.slug} (${application.id})`, { req, account: application.owner })

  const sessionState = await session.req(req)
  eventsQueue.pushEvent({
    title: "Suppression d'une application",
    body: `${application.title} (${application.slug})`,
    topic: {
      key: `data-fair:application-delete:${application.id}`
    },
    sender: application.owner
  }, sessionState)

  await syncDatasets(application)
  res.sendStatus(204)
})

// Get only the configuration part of the application
const getConfig = async (req, res, next) => {
  await refreshConfigDatasetsRefs(req, req.application, false, true)
  res.status(200).send(req.application.configuration || {})
}
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)
router.get('/:applicationId/configuration', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)

// Update only the configuration part of the application
const writeConfig = async (req, res) => {
  // @ts-ignore
  const application = req.application

  const db = mongo.db
  const sessionState = reqSessionAuthenticated(req)
  const { returnValid } = await import('#types/app-config/index.js')
  const appConfig = returnValid(req.body)
  await db.collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        errorMessage: ''
      },
      $set: {
        configuration: appConfig,
        updatedAt: moment().toISOString(),
        updatedBy: { id: sessionState.user.id, name: sessionState.user.name },
        lastConfigured: moment().toISOString(),
        status: 'configured'
      }
    }
  )

  eventsLog.info('df.applications.writeConfig', `wrote application config ${application.slug} (${application.id})`, { req, account: application.owner })

  await journals.log('applications', application, { type: 'config-updated' })
  await syncDatasets({ configuration: req.body })
  res.status(200).json(req.body)
}
router.put('/:applicationId/config', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', readApplication, permissions.middleware('writeConfig', 'write'), writeConfig)

// Configuration draft management
router.get('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  await refreshConfigDatasetsRefs(req, req.application, true, true)
  res.status(200).send(req.application.configurationDraft || req.application.configuration || {})
})
router.put('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), async (req, res, next) => {
  // @ts-ignore
  const application = req.application
  const sessionState = reqSessionAuthenticated(req)
  const { returnValid } = await import('#types/app-config/index.js')
  const appConfig = returnValid(req.body)
  await mongo.db.collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        errorMessageDraft: ''
      },
      $set: {
        configurationDraft: appConfig,
        updatedAt: moment().toISOString(),
        updatedBy: { id: sessionState.user.id, name: sessionState.user.name },
        status: 'configured-draft'
      }
    }
  )
  eventsLog.info('df.applications.validateDraft', `vaidated application config draft ${application.slug} (${application.id})`, { req, account: application.owner })

  await journals.log('applications', application, { type: 'config-draft-updated' })
  res.status(200).json(req.body)
})
router.delete('/:applicationId/configuration-draft', readApplication, permissions.middleware('writeConfig', 'write'), async (req, res, next) => {
  // @ts-ignore
  const application = req.application
  const sessionState = reqSessionAuthenticated(req)

  await mongo.db.collection('applications').updateOne(
    { id: req.params.applicationId },
    {
      $unset: {
        configurationDraft: '',
        errorMessageDraft: ''
      },
      $set: {
        updatedAt: moment().toISOString(),
        updatedBy: { id: sessionState.user.id, name: sessionState.user.name },
        status: application.configuration ? 'configured' : 'created'
      }
    }
  )

  eventsLog.info('df.applications.cancelDraft', `cancelled application config draft ${application.slug} (${application.id})`, { req, account: application.owner })

  await journals.log('applications', application, { type: 'config-draft-cancelled' })
  res.status(200).json(req.body)
})

router.get('/:applicationId/base-application', readApplication, permissions.middleware('readBaseApp', 'read'), readBaseApp, cacheHeaders.noCache, async (req, res) => {
  res.send(baseAppsUtils.clean(req.publicBaseUrl, req.baseApp, req.publicBaseUrl, req.query.html === 'true'))
})

router.get('/:applicationId/api-docs.json', readApplication, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.application.owner.type, id: req.application.owner.id }, { projection: { info: 1 } })
  res.send(applicationAPIDocs(req.application, (settings && settings.info) || {}))
})

router.get('/:applicationId/status', readApplication, permissions.middleware('readConfig', 'read'), cacheHeaders.noCache, (req, res) => {
  res.send(req.application.status)
})

router.get('/:applicationId/journal', readApplication, permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, async (req, res) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'application',
    id: req.application.id,
    'owner.type': req.application.owner.type,
    'owner.id': req.application.owner.id
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  res.json(journal.events)
})

// Used by applications to declare an error
router.post('/:applicationId/error', readApplication, permissions.middleware('writeConfig', 'write'), cacheHeaders.noCache, async (req, res) => {
  if (!req.body.message) return res.status(400).type('text/plain').send('Attribut "message" obligatoire')

  const referer = req.headers.referer || req.headers.referrer
  const draftMode = referer && referer.includes('draft=true')

  const message = sanitizeHtml(req.body.message)

  if (draftMode) {
    // websocket notifications of draft mode errors
    await mongo.db.collection('applications').updateOne({ id: req.application.id }, { $set: { errorMessageDraft: message } })
    await wsEmitter.emit(`applications/${req.params.applicationId}/draft-error`, req.body)
  } else if (req.application.configuration) {
    await mongo.db.collection('applications').updateOne({ id: req.application.id }, { $set: { status: 'error', errorMessage: message } })
    await journals.log('applications', req.application, { type: 'error', data: req.body.message })
  }
  res.status(204).send()
})

router.get('/:applicationId/capture', readApplication, permissions.middleware('readCapture', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  await capture.screenshot(req, res)
})
router.get('/:applicationId/print', readApplication, permissions.middleware('readPrint', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  await capture.print(req, res)
})

// keys for readonly access to application
router.get('/:applicationId/keys', readApplication, permissions.middleware('getKeys', 'admin'), async (req, res) => {
  const applicationKeys = await mongo.db.collection('applications-keys').findOne({ _id: req.application.id })
  res.send((applicationKeys && applicationKeys.keys) || [])
})
router.post('/:applicationId/keys', readApplication, permissions.middleware('setKeys', 'admin'), async (req, res) => {
  // @ts-ignore
  const application = req.application

  validateKeys(req.body)
  for (const key of req.body) {
    if (!key.id) key.id = nanoid()
  }
  await mongo.db.collection('applications-keys').replaceOne({ _id: application.id }, { _id: application.id, keys: req.body, owner: application.owner }, { upsert: true })

  eventsLog.info('df.applications.writeKeys', `wrote application keys ${application.slug} (${application.id})`, { req, account: application.owner })

  const sessionState = await session.req(req)
  eventsQueue.pushEvent({
    title: "Définition d'une clé de protection d'application",
    body: `${application.title} (${application.slug})`,
    topic: {
      key: `data-fair:application-write-keys:${application.id}`
    },
    sender: { ...application.owner, role: 'admin' },
    resource: { type: 'application', title: application.title, id: application.id }
  }, sessionState)

  res.send(req.body)
})

// attachment files
router.post('/:applicationId/attachments', readApplication, permissions.middleware('postAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), clamav.middleware, async (req, res, next) => {
  req.body.size = (await fs.promises.stat(req.file.path)).size
  req.body.updatedAt = moment().toISOString()
  await updateStorage(req.application)
  res.status(200).send(req.body)
})

router.get('/:applicationId/attachments/*attachmentPath', readApplication, permissions.middleware('downloadAttachment', 'read'), cacheHeaders.noCache, async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  // res.set('content-disposition', `inline; filename="${req.params.attachmentPath}"`)

  const relFilePath = path.join(...req.params.attachmentPath)
  const ranges = req.range(1000000)
  if (Array.isArray(ranges) && ranges.length === 1 && ranges.type === 'bytes') {
    const range = ranges[0]
    const filePath = attachmentPath(req.application, relFilePath)
    if (!await fs.pathExists(filePath)) return res.status(404).send()
    const stats = await fs.stat(filePath)

    res.setHeader('content-type', 'application/octet-stream')
    res.setHeader('content-range', `bytes ${range.start}-${range.end}/${stats.size}`)
    res.setHeader('content-length', (range.end - range.start) + 1)
    res.status(206)
    await pump(
      fs.createReadStream(filePath, { start: range.start, end: range.end }),
      // res.throttle('static'),
      res
    )
  }

  await new Promise((resolve, reject) => res.sendFile(
    relFilePath,
    {
      // transformStream: res.throttle('static'),
      root: attachmentsDir(req.application),
      headers: { 'Content-Disposition': contentDisposition(path.basename(relFilePath), { type: 'inline' }) }
    },
    (err) => err ? reject(err) : resolve(true)
  ))
})

router.delete('/:applicationId/attachments/*attachmentPath', readApplication, permissions.middleware('deleteAttachment', 'write'), async (req, res, next) => {
  await fs.remove(attachmentPath(req.application, path.join(...req.params.attachmentPath)))
  await updateStorage(req.application)
  res.status(204).send()
})

router.get('/:applicationId/thumbnail', readApplication, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
  if (!req.application.image) return res.status(404).send("application doesn't have an image")
  await getThumbnail(req, res, req.application.image)
})
