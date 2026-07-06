import path from 'path'
import express, { type RequestHandler } from 'express'
import moment from 'moment'
import mongo from '#mongo'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import applicationAPIDocs from '../../contract/application-api-docs.ts'
import * as ajv from '../misc/utils/ajv.ts'
import applicationKeys from '../../contract/application-keys.js'
import { clean as cleanBaseApp } from '../base-applications/operations.ts'
import * as permissions from '../misc/utils/permissions.ts'
import * as usersUtils from '../misc/utils/users.ts'
import * as capture from '../misc/utils/capture.ts'
import { clean, refreshConfigDatasetsRefs, updateStorage, attachmentPath, attachmentsDir } from './utils.ts'
import * as service from './service.ts'
import { countPartOfChildren, handlePartOfChildren } from '../datasets/service.ts'
import { readApplication, readBaseApp, attemptInsert, reqApplication, reqBaseApp, reqIsNewApplication } from './middlewares.ts'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import * as publicationSites from '../misc/utils/publication-sites.ts'
import { reqPublicationSite } from '../misc/utils/publication-sites.ts'
import { reqPublicBaseUrl } from '../misc/utils/public-base-url.ts'
import { checkStorage } from '../datasets/middlewares.ts'
import * as attachments from '../misc/utils/metadata-attachments.ts'
import * as clamav from '../misc/utils/clamav.ts'
import { getThumbnail } from '../misc/utils/thumbnails.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { type AccountKeys, reqSession, reqSessionAuthenticated, reqUserAuthenticated } from '@data-fair/lib-express'
import { reqEventLogContext } from '../misc/utils/req-context.ts'
import { downloadFileFromStorage } from '../files-storage/utils.ts'
import resolvePath from 'resolve-path'
import filesStorage from '#files-storage'
import type { Application, Request, RequestWithResource } from '#types'

const validateKeys = ajv.compile(applicationKeys)

// permissions.middleware/router return handlers typed against RequestWithResource (which requires
// publicBaseUrl); cast to the plain RequestHandler so they compose in route chains. Same idiom as
// permissions.ts itself (`middleware(...) as RequestHandler`). The cast is on the factory, not per call.
const permissionMiddleware = permissions.middleware as (operationId: string, operationClass: string, trackingCategory?: string, acceptMissing?: boolean) => RequestHandler

const router = express.Router()
export default router

router.use((req, res, next) => {
  permissions.setReqResourceType(req, 'applications')
  next()
})

// Get the list of applications
router.get('', cacheHeaders.listBased, async (req, res) => {
  const response = await service.findApplications(
    req.getLocale(),
    reqPublicationSite(req),
    reqPublicBaseUrl(req),
    req.query as Record<string, string>,
    reqSession(req)
  )
  res.json(response)
})

// Create an application configuration
router.post('', async (req, res) => {
  const sessionState = reqSession(req)
  const { body } = (await import('#doc/applications/post-req/index.js')).returnValid(req)
  const application = await service.initNewApplication(body, usersUtils.owner(req) as AccountKeys, reqUserAuthenticated(req))
  if (!permissions.canDoForOwner(application.owner, 'applications', 'post', sessionState)) return res.status(403).type('text/plain').send()

  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  const created = await service.createApplication(ctx, application)
  res.status(201).json(clean(created, reqPublicBaseUrl(req), reqPublicationSite(req)))
})

router.use('/:applicationId/permissions', readApplication, permissions.router('applications', 'application', async (req, patchedApplication) => {
  // this callback function is called when the resource becomes public
  await publicationSites.onPublic(patchedApplication, 'applications', reqSessionAuthenticated(req))
}))

// retrieve a application by its id
router.get('/:applicationId', readApplication, permissionMiddleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const application = reqApplication(req)
  // userPermissions is a request-time enrichment not in the Application schema (same gap as utils.ts clean); precise cast, not `any`
  ;(application as Application & { userPermissions?: string[] }).userPermissions = permissions.list('applications', application, reqSession(req))
  res.status(200).send(clean(application, reqPublicBaseUrl(req), reqPublicationSite(req), req.query as Record<string, string>))
})

// PUT used to create or update
router.put('/:applicationId', attemptInsert, readApplication, permissionMiddleware('writeDescription', 'write'), async (req, res) => {
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  const newApplication = await service.replaceApplication(ctx, reqApplication(req), req.body, !!reqIsNewApplication(req))
  res.status(200).json(clean(newApplication, reqPublicBaseUrl(req), reqPublicationSite(req)))
})

const permissionsWritePublications = permissionMiddleware('writePublications', 'admin')
const permissionsWritePartOf = permissionMiddleware('writePartOf', 'admin')

// Update an application configuration
router.patch('/:applicationId',
  readApplication,
  permissionMiddleware('writeDescription', 'write'),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  (req, res, next) => ('partOf' in req.body) ? permissionsWritePartOf(req, res, next) : next(),
  async (req, res) => {
    const application = reqApplication(req)
    const { body: patch } = (await import('#doc/applications/patch-req/index.js')).returnValid(req)

    // Strip publicBaseUrl from image URL for multi-domain compatibility
    if (patch.image?.startsWith(reqPublicBaseUrl(req))) {
      patch.image = patch.image.slice(reqPublicBaseUrl(req).length)
    }

    const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
    if (patch.configuration) await service.handleConfigOrphans(req.app, ctx, application, patch.configuration, req.query.childrenAction as string | undefined)
    let patched
    try {
      patched = await service.patchApplication(ctx, application, patch)
    } catch (err: any) {
      if (err?.message === 'errors.dupSlug') throw httpError(400, req.__('errors.dupSlug'))
      throw err
    }
    res.status(200).json(clean(patched, reqPublicBaseUrl(req), reqPublicationSite(req)))
  }
)

// Change ownership of an application
router.put('/:applicationId/owner', readApplication, permissionMiddleware('delete', 'admin'), async (req, res) => {
  const sessionState = reqSessionAuthenticated(req)

  // Must be able to delete the current application, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'applications', 'post', sessionState)) return res.status(403).type('text/plain').send('Vous ne pouvez pas créer d\'application dans le nouveau propriétaire')

  const ctx = { sessionState, logCtx: reqEventLogContext(req) }
  const patchedApp = await service.changeApplicationOwner(ctx, reqApplication(req), req.body)
  res.status(200).json(clean(patchedApp, reqPublicBaseUrl(req), reqPublicationSite(req)))
})

// Delete an application configuration
router.delete('/:applicationId', readApplication, permissionMiddleware('delete', 'admin'), async (req, res) => {
  const application = reqApplication(req)
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }

  const [childDatasetsCount, childAppsCount] = await Promise.all([
    countPartOfChildren('application', application.id),
    service.countChildApplications(application.id)
  ])
  const childrenCount = childDatasetsCount + childAppsCount
  if (childrenCount > 0) {
    const childrenAction = req.query.childrenAction as string | undefined
    if (childrenAction !== 'delete' && childrenAction !== 'unflag') {
      throw httpError(409, `Cette application a ${childrenCount} ressource(s) enfant(s) qui n'existent que dans ce cadre. Précisez "childrenAction=delete" pour les supprimer aussi, ou "childrenAction=unflag" pour seulement leur retirer l'attribut enfant.`)
    }
    // the children were explicitly opted into this relationship by their own owner (via the
    // admin-only writePartOf permission on the child itself), so no extra per-child permission check
    // is required here — the cascading action was already authorized when partOf was set
    await handlePartOfChildren(req.app, 'application', application.id, childrenAction)
    await service.handleChildApplications(ctx, application.id, childrenAction)
  }

  await service.deleteApplication(ctx, application)
  res.sendStatus(204)
})

// Get only the configuration part of the application
const getConfig: express.RequestHandler = async (req, res, next) => {
  await refreshConfigDatasetsRefs(req as Request, reqApplication(req), false, true)
  res.status(200).send(reqApplication(req).configuration || {})
}
// 2 paths kept for compatibility.. but /config is deprecated because not homogeneous with the structure of the object
router.get('/:applicationId/config', readApplication, permissionMiddleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)
router.get('/:applicationId/configuration', readApplication, permissionMiddleware('readConfig', 'read'), cacheHeaders.resourceBased(), getConfig)

// Update only the configuration part of the application
const writeConfig: express.RequestHandler = async (req, res) => {
  const { returnValid } = await import('#types/app-config/index.js')
  const appConfig = returnValid(req.body)
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  await service.handleConfigOrphans(req.app, ctx, reqApplication(req), appConfig, req.query.childrenAction as string | undefined)
  await service.writeApplicationConfig(ctx, reqApplication(req), appConfig)
  res.status(200).json(req.body)
}
router.put('/:applicationId/config', readApplication, permissionMiddleware('writeConfig', 'write'), writeConfig)
router.put('/:applicationId/configuration', readApplication, permissionMiddleware('writeConfig', 'write'), writeConfig)

// Configuration draft management
router.get('/:applicationId/configuration-draft', readApplication, permissionMiddleware('writeConfig', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  // schemaOnly: the consumer is the config editor (vjsf), which strips fields not in the
  // app schema. Full enrichment caused phantom drafts on mount (diff between server-enriched
  // configDraft and vjsf-normalized editConfig). We keep the refresh for schema-declared keys
  // (e.g. dataset title) but skip extras like slug and non-schema select fields.
  await refreshConfigDatasetsRefs(req as Request, reqApplication(req), true, true, true)
  const application = reqApplication(req)
  res.status(200).send(application.configurationDraft || application.configuration || {})
})
router.put('/:applicationId/configuration-draft', readApplication, permissionMiddleware('writeConfig', 'write'), async (req, res, next) => {
  const { returnValid } = await import('#types/app-config/index.js')
  const appConfig = returnValid(req.body)
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  await service.writeConfigDraft(ctx, reqApplication(req), appConfig)
  res.status(200).json(req.body)
})
router.delete('/:applicationId/configuration-draft', readApplication, permissionMiddleware('writeConfig', 'write'), async (req, res, next) => {
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  await service.deleteConfigDraft(ctx, reqApplication(req))
  res.status(200).json(req.body)
})

router.get('/:applicationId/base-application', readApplication, permissionMiddleware('readBaseApp', 'read'), readBaseApp, cacheHeaders.noCache, async (req, res) => {
  res.send(cleanBaseApp(reqPublicBaseUrl(req), reqBaseApp(req), reqPublicBaseUrl(req), req.query.html as unknown as boolean))
})

router.get('/:applicationId/api-docs.json', readApplication, permissionMiddleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  const application = reqApplication(req)
  const settings = await mongo.db.collection('settings')
    .findOne({ type: application.owner.type, id: application.owner.id }, { projection: { info: 1 } })
  res.send(applicationAPIDocs(application, (settings && settings.info) || {}, reqPublicBaseUrl(req)))
})

router.get('/:applicationId/status', readApplication, permissionMiddleware('readConfig', 'read'), cacheHeaders.noCache, (req, res) => {
  res.send(reqApplication(req).status)
})

router.get('/:applicationId/journal', readApplication, permissionMiddleware('readJournal', 'read'), cacheHeaders.noCache, async (req, res) => {
  res.json(await service.getApplicationJournal(reqApplication(req)))
})

// Used by applications to declare an error
router.post('/:applicationId/error', readApplication, permissionMiddleware('writeConfig', 'write'), cacheHeaders.noCache, async (req, res) => {
  if (!req.body.message) return res.status(400).type('text/plain').send('Attribut "message" obligatoire')

  const referer = req.headers.referer || req.headers.referrer
  const draftMode = !!(referer && referer.includes('draft=true'))

  const message = sanitizeHtml(req.body.message)

  await service.declareApplicationError(reqApplication(req), message, draftMode, req.body)
  res.status(204).send()
})

router.get('/:applicationId/capture', readApplication, permissionMiddleware('readCapture', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  await capture.screenshot(req as RequestWithResource, res)
})
router.get('/:applicationId/print', readApplication, permissionMiddleware('readPrint', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  await capture.print(req as RequestWithResource, res)
})

// keys for readonly access to application
router.get('/:applicationId/keys', readApplication, permissionMiddleware('getKeys', 'admin'), async (req, res) => {
  res.send(await service.getApplicationKeys(reqApplication(req).id))
})
router.post('/:applicationId/keys', readApplication, permissionMiddleware('setKeys', 'admin'), async (req, res) => {
  validateKeys(req.body)
  const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
  await service.writeApplicationKeys(ctx, reqApplication(req), req.body)
  res.send(req.body)
})

// attachment files
// clamav.ts types middleware with the DOM Response, not express — cast until clamav.ts is fixed (parking lot)
router.post('/:applicationId/attachments', readApplication, permissionMiddleware('postAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), clamav.middleware as unknown as RequestHandler, async (req, res, next) => {
  req.body.size = req.file!.size
  req.body.updatedAt = moment().toISOString()
  await updateStorage(reqApplication(req))
  res.status(200).send(req.body)
})

router.get('/:applicationId/attachments/*attachmentPath', readApplication, permissionMiddleware('downloadAttachment', 'read'), cacheHeaders.noCache, async (req, res, next) => {
  const relFilePath = path.join(...req.params.attachmentPath)
  await downloadFileFromStorage(
    resolvePath(attachmentsDir(reqApplication(req)), relFilePath),
    req, res, { dispositionType: 'inline' })
})

router.delete('/:applicationId/attachments/*attachmentPath', readApplication, permissionMiddleware('deleteAttachment', 'write'), async (req, res, next) => {
  await filesStorage.removeFile(attachmentPath(reqApplication(req), path.join(...req.params.attachmentPath)))
  await updateStorage(reqApplication(req))
  res.status(204).send()
})

router.get('/:applicationId/thumbnail', readApplication, permissionMiddleware('readDescription', 'read'), async (req, res, next) => {
  const application = reqApplication(req)
  if (!application.image) return res.status(404).send("application doesn't have an image")
  await getThumbnail(req, res, application.image)
})
