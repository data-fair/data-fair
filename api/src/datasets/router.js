import express from 'express'
import * as ajv from '../misc/utils/ajv.ts'
import fs from 'fs-extra'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import equal from 'deep-equal'
import slug from 'slugify'
import * as journals from '../misc/utils/journals.ts'
import * as esUtils from './es/index.ts'
import { initDatasetIndex, switchAlias, datasetInfos } from '../datasets/es/manage-indices.ts'
import { computeRealtimeWarnings } from './es/diagnose-warnings.ts'
import * as uploadUtils from './utils/upload.ts'
import datasetAPIDocs from '../../contract/dataset-api-docs.ts'
import privateDatasetAPIDocs from '../../contract/dataset-private-api-docs.ts'
import * as permissions from '../misc/utils/permissions.ts'
import * as usersUtils from '../misc/utils/users.ts'
import * as datasetUtils from './utils/index.ts'
import { updateStorage } from './utils/storage.ts'
import * as restDatasetsUtils from './utils/rest.ts'
import clone from '@data-fair/lib-utils/clone.js'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import * as limits from '../limits/service.ts'
import { extend } from './utils/extensions.ts'
import * as notifications from '../misc/utils/notifications.ts'
import userNotificationSchema from '../../contract/user-notification.js'
import { getThumbnail } from '../misc/utils/thumbnails.ts'
import applicationKey from '../misc/utils/application-key.ts'
import * as publicationSites from '../misc/utils/publication-sites.ts'
import * as clamav from '../misc/utils/clamav.ts'
import * as rateLimiting from '../misc/utils/rate-limiting.ts'
import { syncDataset as syncRemoteService } from '../remote-services/service.ts'
import { applyPatch, createDataset, memoizedGetDataset, cancelDraft } from './service.ts'
import { preparePatch } from './utils/patch.ts'
import { checkStorage, lockDataset, readDataset } from './middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite } from './routes/_common.ts'
import { registerMasterDataRoutes } from './routes/master-data.ts'
import { registerReadRoutes } from './routes/read.ts'
import { registerLinesRoutes } from './routes/lines.ts'
import { registerOwnLinesRoutes } from './routes/own-lines.ts'
import { registerFilesRoutes } from './routes/files.ts'
import { registerMetadataRoutes } from './routes/metadata.ts'
import config from '#config'
import mongo from '#mongo'
import debugModule from 'debug'
import { reqAdminMode, reqSession, reqSessionAuthenticated } from '@data-fair/lib-express'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { getFlatten } from './utils/flatten.ts'
import { can } from '../misc/utils/permissions.ts'
import { emit as workerPing } from '../workers/ping.ts'
import filesStorage from '#files-storage'

const validateUserNotification = ajv.compile(userNotificationSchema)

const router = express.Router()

const clean = datasetUtils.clean

const debugLimits = debugModule('limits')

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'datasets'
  next()
})

registerMetadataRoutes(router)

const debugCreateDataset = debugModule('create-dataset')

// Create a dataset
const createDatasetRoute = async (req, res) => {
  const db = mongo.db
  const es = req.app.get('es')
  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)
  const draft = req.query.draft === 'true'

  debugCreateDataset('upload files')
  /** @type {undefined | any[]} */
  const files = await uploadUtils.getFiles(req, res)
  debugCreateDataset('uploaded files', files)

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
      debugCreateDataset('clamav check ok')
    }

    req.body = uploadUtils.getFormBody(req.body)
    const { body } = (await import('#doc/datasets/post-req/index.js')).returnValid(req)

    const owner = usersUtils.owner(req)
    if (!permissions.canDoForOwner(owner, 'datasets', 'post', sessionState)) {
      throw httpError(403, req.__('errors.missingPermission'))
    }
    if ((await limits.remaining(owner)).nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/beforeUpload', { owner })
      throw httpError(429, req.__('errors.exceedLimitNbDatasets'))
    }

    // this is kept for retro-compatibility, but we should think of deprecating it
    // self chosen ids are not a good idea
    // there is a reason why we use a unique id generator and a slug system)
    if (req.params.datasetId) {
      if (!req.params.datasetId.match(/^[a-z0-9_\\-]+$/)) {
        throw httpError(400, req.__('errors.urlFriendly', { value: req.params.datasetId, slug: slug(req.params.datasetId, { lower: true, strict: true }) }))
      }
      body.id = req.params.datasetId
    }

    /**
     * @param {() => void} callback
     */
    const onClose = (callback) => res.on('close', callback)
    res.setMaxListeners(100)

    debugCreateDataset('call createDataset')
    const dataset = await createDataset(db, es, locale, sessionState, owner, body, files, draft, onClose)

    if (dataset.isRest && dataset.status === 'finalized') {
      debugCreateDataset('init rest dataset')
      // case where we simply initialize the empty dataset
      // being empty this is not costly and can be performed by the API
      await restDatasetsUtils.initDataset(dataset)
      const indexName = await initDatasetIndex(dataset)
      await switchAlias(dataset, indexName)
      await restDatasetsUtils.configureHistory(dataset)
      await updateStorage(dataset)
      onClose(() => {
        // this is only to maintain compatibilty, but clients should look for the status in the response
        // and not wait for an event if the dataset is created already finalized
        journals.log('datasets', dataset, { type: 'finalize-end' }).catch(err => {
          console.error('failure when send finalize-end to journal after rest dataset creation', err)
        })
      })
    }
    if (dataset.isMetaOnly) {
      await updateStorage(dataset)
    }

    eventsLog.info('df.datasets.create', `created a dataset ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

    debugCreateDataset('final steps')
    await journals.log('datasets', dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id })
    await notifications.sendResourceEvent('datasets', dataset, sessionState, 'dataset-created')
    await syncRemoteService(dataset)

    await workerPing('datasets', dataset.id)

    res.status(201).send(clean(req, dataset, draft))
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }
}
router.post('', apiKeyMiddlewareWrite, rateLimiting.middleware, checkStorage(true, true), createDatasetRoute)

const updateDatasetRoute = async (req, res, next) => {
  // deep clone to allow mutation by applyPatch (req.dataset may be an immutable proxy from cache)
  const dataset = clone(req.dataset)

  if (!dataset) {
    await createDatasetRoute(req, res, next)
    return
  }

  // force the file upload middleware to write files in draft directory, as updated datasets always go into draft mode
  req._draft = true

  const locale = req.getLocale()
  const sessionState = reqSessionAuthenticated(req)

  const files = await uploadUtils.getFiles(req, res)

  try {
    if (files) {
      await clamav.checkFiles(files, sessionState.user)
    }

    req.body = uploadUtils.getFormBody(req.body)

    // this is also done inside preparePatch
    // but in the case of PUT we do it here to tolerate properties usually used at creation time
    for (const key of Object.keys(req.body)) {
      if (equal(req.body[key], dataset[key])) { delete req.body[key] }
    }
    if (req.body.owner && req.body.owner.type === dataset.owner.type && req.body.owner.id === dataset.owner.id) {
      delete req.body.owner
    }

    const { body: patch } = (await import('#doc/datasets/patch-req/index.js')).returnValid(req)

    // TODO: do not use always as default value when the dataset is public or published ?
    const canBreak = can('datasets', req.dataset, 'writeDescriptionBreaking', reqSession(req))
    let draftValidationMode
    if (req.datasetFull.status === 'draft') {
      draftValidationMode = 'never'
    } else {
      if (req.query.draft === 'true') {
        if ((patch.schema ?? dataset.schema).find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) draftValidationMode = 'never'
        else draftValidationMode = 'compatible'
      } else {
        draftValidationMode = req.query.draft ?? 'always'
      }
    }

    if (!['never', 'always', 'compatible', 'compatibleOrCancel'].includes(draftValidationMode)) throw httpError(400, `unknown value for draft validation mode ${draftValidationMode}`)
    if (!canBreak && draftValidationMode === 'always') throw httpError(403, 'draft mode "always" is not permitted')

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, sessionState, locale, draftValidationMode, files)
      .catch(err => {
        if (err.code !== 11000) throw err
        throw httpError(400, req.__('errors.dupSlug'))
      })

    if (!isEmpty) {
      await publicationSites.applyPatch(dataset, { ...dataset, ...patch }, sessionState, 'datasets')
      await applyPatch(dataset, patch, removedRestProps, attemptMappingUpdate)

      eventsLog.info('df.datasets.update', `updated dataset ${dataset.slug} (${dataset.id}) keys ${JSON.stringify(Object.keys(patch))}`, { req, account: dataset.owner })

      const draft = !!dataset.draftReason
      eventsQueue.pushEvent({
        title: `Propriétés modifiées sur un ${draft ? 'brouillon de ' : ''}jeu de données`,
        body: `${draft ? 'brouillon ' : ''}${dataset.title} (${dataset.slug}), ${Object.keys(patch)?.join(', ')}`,
        topic: {
          key: `data-fair:dataset${draft ? '-draft' : ''}-patched-properties:${dataset.id}`
        },
        sender: dataset.owner,
        resource: { type: 'dataset', title: dataset.title, id: dataset.id }
      }, sessionState)

      if (files) {
        await journals.log('datasets', dataset, { type: 'data-updated' })
        await notifications.sendResourceEvent('datasets', dataset, sessionState, 'data-updated')
      }
      await syncRemoteService(dataset)
    }
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }

  res.status(200).json(clean(req, dataset))
}

router.post('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)
router.put('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)

// validate the draft
// TODO: apply different permission if draft has breaking changes or not
router.post('/:datasetId/draft', readDataset({ acceptedStatuses: ['finalized'], alwaysDraft: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('validateDraft', 'write'), lockDataset(), async (req, res, next) => {
  const dataset = clone(req.dataset)
  const sessionState = reqSession(req)

  if (!req.datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }

  const patch = { status: 'validated', validateDraft: true }
  await applyPatch(dataset, patch)
  await journals.log('datasets', dataset, { type: 'draft-validated', data: 'validation manuelle' })
  await notifications.sendResourceEvent('datasets', dataset, sessionState, 'draft-validated', { localizedParams: { cause: { fr: 'validation manuelle', en: 'manual validation' } } })
  eventsLog.info('df.datasets.validateDraft', `validated dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })

  return res.send(dataset)
})

// cancel the draft
router.delete('/:datasetId/draft', readDataset({ acceptedStatuses: ['draft', 'finalized', 'error'], alwaysDraft: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('cancelDraft', 'write'), lockDataset(), async (req, res, next) => {
  const dataset = clone(req.dataset)
  const sessionState = reqSession(req)
  const datasetFull = clone(req.datasetFull)

  if (datasetFull.status === 'draft') {
    return res.status(409).send('Impossible d\'annuler un brouillon si aucune version du jeu de données n\'a été validée.')
  }
  if (!datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  const patch = { draft: null }
  await cancelDraft(dataset)
  await applyPatch(datasetFull, patch)
  await journals.log('datasets', dataset, { type: 'draft-cancelled' }, false, sessionState)

  eventsLog.info('df.datasets.cancelDraft', `cancelled dataset draft ${dataset.slug} (${dataset.id})`, { req, account: dataset.owner })
  await notifications.sendResourceEvent('datasets', dataset, sessionState, 'draft-cancelled')

  await updateStorage(datasetFull)

  return res.send(datasetFull)
})

registerLinesRoutes(router)

registerOwnLinesRoutes(router)

registerMasterDataRoutes(router)

registerReadRoutes(router)

registerFilesRoutes(router)

router.get('/:datasetId/metadata-settings', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset
  const settings = await mongo.db.collection('settings')
    .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { datasetsMetadata: 1 } })
  return res.send(settings?.datasetsMetadata ?? {})
})

router.get('/:datasetId/api-docs.json', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
  res.send(datasetAPIDocs(req.dataset, req.publicBaseUrl, settings, req.publicationSite).api)
})

router.get('/:datasetId/private-api-docs.json', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readPrivateApiDoc', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
  res.send(privateDatasetAPIDocs(req.dataset, req.publicBaseUrl, reqSessionAuthenticated(req), settings))
})

router.get('/:datasetId/journal', readDataset({ acceptInitialDraft: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'dataset',
    id: req.dataset.id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  }, {
    projection: {
      // arbitrary limit at 1000 events
      events: { $slice: -1000 }
    }
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  for (const e of journal.events) {
    if (e.data) e.data = sanitizeHtml(e.data)
  }
  res.json(journal.events)
})

router.get('/:datasetId/task-progress', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
  const journal = await mongo.db.collection('journals').findOne({
    type: 'dataset',
    id: req.dataset.id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  })
  if (!journal) return res.send({})
  if (!journal.taskProgress) return res.send({})
  res.json(journal.taskProgress)
})

const sendUserNotificationPermissions = permissions.middleware('sendUserNotification', 'write')
const sendUserNotificationPublicPermissions = permissions.middleware('sendUserNotificationPublic', 'write')
router.post(
  '/:datasetId/user-notification',
  readDataset(),
  applicationKey,
  apiKeyMiddlewareWrite, rateLimiting.middleware,
  (req, res, next) => req.body.visibility === 'public' ? sendUserNotificationPublicPermissions(req, res, next) : sendUserNotificationPermissions(req, res, next),
  async (req, res, next) => {
    const userNotification = req.body
    validateUserNotification(userNotification)
    const sessionState = reqSessionAuthenticated(req)
    const urlParams = userNotification.urlParams || {}
    userNotification.visibility = userNotification.visibility || 'private'
    if (userNotification.visibility !== 'private') {
      const ownerRole = permissions.getOwnerRole(req.dataset.owner, sessionState)
      if (!['admin', 'contrib'].includes(ownerRole)) return res.status(403).type('text/plain').send('User does not have permission to emit a public notification')
    }
    const notif = {
      sender: req.dataset.owner,
      topic: { key: `data-fair:dataset-user-notification:${req.dataset.slug}:${userNotification.topic}` },
      title: userNotification.title,
      body: userNotification.body,
      urlParams: { ...urlParams, datasetId: req.dataset.id, datasetSlug: req.dataset.slug, userId: sessionState.user.id },
      visibility: userNotification.visibility,
      recipient: userNotification.recipient,
      extra: { user: { id: sessionState.user.id, name: sessionState.user.name } },
      resource: { type: 'dataset', id: req.dataset.id }
    }
    await notifications.send(notif, true, sessionState)
    res.send(notif)
  }
)

router.get('/:datasetId/thumbnail', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
  if (!req.dataset.image) return res.status(404).send("dataset doesn't have an image")
  await getThumbnail(req, res, req.dataset.image)
})
router.get('/:datasetId/thumbnail/:thumbnailId', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLines', 'read'), async (req, res, next) => {
  const url = Buffer.from(req.params.thumbnailId, 'hex').toString()
  if (req.dataset.attachmentsAsImage && url.startsWith('/attachments/')) {
    if (req.dataset.isVirtual) {
      const childDatasetId = url.split('/')[2]
      if (!req.dataset.descendants?.find(c => c === childDatasetId)) return res.status(404).send('Child dataset not found')
      const { dataset: childDataset } = await memoizedGetDataset(childDatasetId, req.publicationSite, req.mainPublicationSite, false, false, false, mongo.db, undefined, undefined)
      const documentProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      const childDocumentProp = childDataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      if (!documentProp || documentProp.key !== childDocumentProp.key) return res.status(404).send('No attachment column found')
      await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, datasetUtils.attachmentPath(childDataset, url.replace(`/attachments/${childDatasetId}/`, '')), req.dataset.thumbnails)
    } else {
      await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, datasetUtils.attachmentPath(req.dataset, url.replace('/attachments/', '')), req.dataset.thumbnails)
    }
  } else {
    const imageField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    const count = await esUtils.count(req.dataset, {
      qs: `${esUtils.escapeFilter(imageField.key)}:${esUtils.escapeFilter(url)}`
    })
    if (!count) return res.status(404).send('thumbnail does not match a URL from this dataset')
    await getThumbnail(req, res, url, null, req.dataset.thumbnails)
  }
})

router.get('/:datasetId/read-api-key', readDataset(), permissions.middleware('getReadApiKey', 'read'), async (req, res, next) => {
  if (!req.dataset._readApiKey) return res.status(404).send("dataset doesn't have a read API key")
  res.send(req.dataset._readApiKey)
})

router.post('/:datasetId/_simulate-extension', readDataset({ noCache: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('simulateExtension', 'write'), async (req, res, next) => {
  const line = req.body
  const dataset = clone(req.dataset.__proxyTarget ?? req.dataset)
  if (!dataset.extensions?.length) throw httpError(400, 'no extension to simulate')
  await extend(dataset, dataset.extensions, undefined, undefined, undefined, line)
  const flatten = getFlatten(req.dataset, req.query.arrays === 'true')
  res.send(flatten(line))
})

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset({ fillDescendants: true, acceptInitialDraft: true, noCache: true }), cacheHeaders.noCache, async (req, res) => {
  reqAdminMode(req)
  const esInfos = await datasetInfos(req.dataset)
  const filesInfos = await filesStorage.lsrWithStats(datasetUtils.dir(req.dataset))
  const locks = [
    await mongo.db.collection('locks').findOne({ _id: `datasets:${req.dataset.id}` }),
    await mongo.db.collection('locks').findOne({ _id: `datasets:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  ]
  const warnings = computeRealtimeWarnings(req.dataset, esInfos, config.elasticsearch)
  res.json({ filesInfos, esInfos, locks, warnings })
})

// Special admin route to force reindexing a dataset
router.post('/:datasetId/_reindex', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const patchedDataset = await datasetUtils.reindex(mongo.db, req.dataset)
  res.status(200).send(patchedDataset)
})

// Special admin route to force refinalizing a dataset
router.post('/:datasetId/_refinalize', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const patchedDataset = await datasetUtils.refinalize(mongo.db, req.dataset)
  res.status(200).send(patchedDataset)
})

// Special admin route to clear all locks on a dataset
router.delete('/:datasetId/_lock', readDataset({ noCache: true }), async (req, res) => {
  reqAdminMode(req)
  const db = mongo.db
  await db.collection('locks').deleteOne({ _id: `datasets:${req.dataset.id}` })
  await db.collection('locks').deleteOne({ _id: `datasets:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  res.status(204).send()
})

export default router
