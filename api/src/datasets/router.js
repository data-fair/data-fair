import express from 'express'
import * as ajv from '../misc/utils/ajv.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import * as esUtils from './es/index.ts'
import { datasetInfos } from '../datasets/es/manage-indices.ts'
import { computeRealtimeWarnings } from './es/diagnose-warnings.ts'
import datasetAPIDocs from '../../contract/dataset-api-docs.ts'
import privateDatasetAPIDocs from '../../contract/dataset-private-api-docs.ts'
import * as permissions from '../misc/utils/permissions.ts'
import * as datasetUtils from './utils/index.ts'
import clone from '@data-fair/lib-utils/clone.js'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import { extend } from './utils/extensions.ts'
import * as notifications from '../misc/utils/notifications.ts'
import userNotificationSchema from '../../contract/user-notification.js'
import { getThumbnail } from '../misc/utils/thumbnails.ts'
import applicationKey from '../misc/utils/application-key.ts'
import * as rateLimiting from '../misc/utils/rate-limiting.ts'
import { memoizedGetDataset } from './service.ts'
import { readDataset } from './middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite } from './routes/_common.ts'
import { registerMasterDataRoutes } from './routes/master-data.ts'
import { registerReadRoutes } from './routes/read.ts'
import { registerLinesRoutes } from './routes/lines.ts'
import { registerOwnLinesRoutes } from './routes/own-lines.ts'
import { registerFilesRoutes } from './routes/files.ts'
import { registerMetadataRoutes } from './routes/metadata.ts'
import { registerWriteRoutes } from './routes/write.ts'
import config from '#config'
import mongo from '#mongo'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import { getFlatten } from './utils/flatten.ts'
import filesStorage from '#files-storage'

const validateUserNotification = ajv.compile(userNotificationSchema)

const router = express.Router()

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'datasets'
  next()
})

registerMetadataRoutes(router)

registerWriteRoutes(router)

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
