// Docs, journal, notifications, thumbnails, read-api-key and admin routes (extracted from router.js, phase 6d)
import type { Router } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import clone from '@data-fair/lib-utils/clone.js'
import config from '#config'
import mongo from '#mongo'
import filesStorage from '#files-storage'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import * as ajv from '../../misc/utils/ajv.ts'
import userNotificationSchema from '../../../contract/user-notification.js'
import datasetAPIDocs from '../../../contract/dataset-api-docs.ts'
import privateDatasetAPIDocs from '../../../contract/dataset-private-api-docs.ts'
import * as esUtils from '../es/index.ts'
import { datasetInfos } from '../es/manage-indices.ts'
import { computeRealtimeWarnings } from '../es/diagnose-warnings.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as datasetUtils from '../utils/index.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import { extend } from '../utils/extensions.ts'
import * as notifications from '../../misc/utils/notifications.ts'
import { getThumbnail } from '../../misc/utils/thumbnails.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import { getFlatten } from '../utils/flatten.ts'
import { memoizedGetDataset } from '../service.ts'
import { readDataset, reqDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite } from './_common.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../../misc/utils/publication-sites.ts'

const validateUserNotification = ajv.compile(userNotificationSchema)
const sendUserNotificationPermissions = permissions.middleware('sendUserNotification', 'write')
const sendUserNotificationPublicPermissions = permissions.middleware('sendUserNotificationPublic', 'write')

export const registerMiscRoutes = (router: Router) => {
  router.get('/:datasetId/metadata-settings', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
    const dataset = reqDataset(req)
    const settings = await mongo.db.collection('settings')
      .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { datasetsMetadata: 1 } })
    return res.send(settings?.datasetsMetadata ?? {})
  })

  router.get('/:datasetId/api-docs.json', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), async (req, res) => {
    const dataset = reqDataset(req)
    const settings = await mongo.db.collection('settings')
      .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
    res.send(datasetAPIDocs(dataset, reqPublicBaseUrl(req), settings, reqPublicationSite(req)).api)
  })

  router.get('/:datasetId/private-api-docs.json', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readPrivateApiDoc', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
    const dataset = reqDataset(req)
    const settings = await mongo.db.collection('settings')
      .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { info: 1, compatODS: 1 } })
    const sessionState = reqSessionAuthenticated(req)
    const bypass = permissions.reqBypassPermissions(req)
    // admin mode returns the unfiltered doc; otherwise the doc is restricted to the caller's permissions
    const filterOperations = sessionState.user?.adminMode
      ? undefined
      : permissions.list('datasets', dataset, sessionState, bypass)
    res.send(privateDatasetAPIDocs(dataset, reqPublicBaseUrl(req), sessionState, settings, { filterOperations }))
  })

  router.get('/:datasetId/journal', readDataset({ acceptInitialDraft: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res) => {
    const dataset = reqDataset(req)
    const journal: any = await mongo.db.collection('journals').findOne({
      type: 'dataset',
      id: dataset.id,
      'owner.type': dataset.owner.type,
      'owner.id': dataset.owner.id
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
    const dataset = reqDataset(req)
    const journal: any = await mongo.db.collection('journals').findOne({
      type: 'dataset',
      id: dataset.id,
      'owner.type': dataset.owner.type,
      'owner.id': dataset.owner.id
    })
    if (!journal) return res.send({})
    if (!journal.taskProgress) return res.send({})
    res.json(journal.taskProgress)
  })

  router.post(
    '/:datasetId/user-notification',
    readDataset(),
    applicationKey,
    apiKeyMiddlewareWrite, rateLimiting.middleware,
    (req, res, next) => req.body.visibility === 'public' ? sendUserNotificationPublicPermissions(req, res, next) : sendUserNotificationPermissions(req, res, next),
    async (req, res, next) => {
      const dataset = reqDataset(req)
      const userNotification = req.body
      validateUserNotification(userNotification)
      const sessionState = reqSessionAuthenticated(req)
      const urlParams = userNotification.urlParams || {}
      userNotification.visibility = userNotification.visibility || 'private'
      if (userNotification.visibility !== 'private') {
        const ownerRole = permissions.getOwnerRole(dataset.owner, sessionState)
        if (!['admin', 'contrib'].includes(ownerRole as string)) return res.status(403).type('text/plain').send('User does not have permission to emit a public notification')
      }
      const notif = {
        sender: dataset.owner,
        topic: { key: `data-fair:dataset-user-notification:${dataset.slug}:${userNotification.topic}` },
        title: userNotification.title,
        body: userNotification.body,
        urlParams: { ...urlParams, datasetId: dataset.id, datasetSlug: dataset.slug, userId: sessionState.user.id },
        visibility: userNotification.visibility,
        recipient: userNotification.recipient,
        extra: { user: { id: sessionState.user.id, name: sessionState.user.name } },
        resource: { type: 'dataset', id: dataset.id }
      }
      // notifications.send is (event, sessionState?); pass the real session so api-key originator
      // attribution works. The legacy `true` was an obsolete `subscribedOnly` flag (feature removed).
      await notifications.send(notif, sessionState)
      res.send(notif)
    }
  )

  router.get('/:datasetId/thumbnail', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readDescription', 'read'), async (req, res, next) => {
    const dataset: any = reqDataset(req)
    if (!dataset.image) return res.status(404).send("dataset doesn't have an image")
    await getThumbnail(req, res, dataset.image)
  })
  router.get('/:datasetId/thumbnail/:thumbnailId', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLines', 'read'), async (req, res, next) => {
    const dataset: any = reqDataset(req)
    const url = Buffer.from(req.params.thumbnailId as string, 'hex').toString()
    if (dataset.attachmentsAsImage && url.startsWith('/attachments/')) {
      if (dataset.isVirtual) {
        const childDatasetId = url.split('/')[2]
        if (!dataset.descendants?.find((c: any) => c === childDatasetId)) return res.status(404).send('Child dataset not found')
        const { dataset: childDataset } = await memoizedGetDataset(childDatasetId, reqPublicationSite(req), reqMainPublicationSite(req), false, false, false, mongo.db, undefined, undefined)
        const documentProp = dataset.schema.find((p: any) => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
        const childDocumentProp = childDataset.schema.find((p: any) => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
        if (!documentProp || documentProp.key !== childDocumentProp.key) return res.status(404).send('No attachment column found')
        await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${dataset.id}${url}`, datasetUtils.attachmentPath(childDataset, url.replace(`/attachments/${childDatasetId}/`, '')), dataset.thumbnails)
      } else {
        await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${dataset.id}${url}`, datasetUtils.attachmentPath(dataset, url.replace('/attachments/', '')), dataset.thumbnails)
      }
    } else {
      const imageField = dataset.schema.find((f: any) => f['x-refersTo'] === 'http://schema.org/image')
      const count = await esUtils.count(dataset, {
        qs: `${esUtils.escapeFilter(imageField.key)}:"${esUtils.escapeFilter(url)}"`
      })
      if (!count) return res.status(404).send('thumbnail does not match a URL from this dataset')
      await getThumbnail(req, res, url, null, dataset.thumbnails)
    }
  })

  router.get('/:datasetId/read-api-key', readDataset(), permissions.middleware('getReadApiKey', 'read'), async (req, res, next) => {
    const dataset: any = reqDataset(req)
    if (!dataset._readApiKey) return res.status(404).send("dataset doesn't have a read API key")
    res.send(dataset._readApiKey)
  })

  router.post('/:datasetId/_simulate-extension', readDataset({ noCache: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('simulateExtension', 'write'), async (req, res, next) => {
    const line = req.body
    const reqDatasetValue: any = reqDataset(req)
    const dataset = clone(reqDatasetValue.__proxyTarget ?? reqDatasetValue)
    if (!dataset.extensions?.length) throw httpError(400, 'no extension to simulate')
    await extend(dataset, dataset.extensions, undefined, undefined, undefined, line)
    const flatten = getFlatten(reqDatasetValue, req.query.arrays === 'true')
    res.send(flatten(line))
  })

  // Special route with very technical informations to help diagnose bugs, broken indices, etc.
  router.get('/:datasetId/_diagnose', readDataset({ fillDescendants: true, acceptInitialDraft: true, noCache: true }), cacheHeaders.noCache, async (req, res) => {
    const dataset: any = reqDataset(req)
    reqAdminMode(req)
    const esInfos = await datasetInfos(dataset)
    const filesInfos = await filesStorage.lsrWithStats(datasetUtils.dir(dataset))
    const locks = [
      await mongo.db.collection<{ _id: string }>('locks').findOne({ _id: `datasets:${dataset.id}` }),
      await mongo.db.collection<{ _id: string }>('locks').findOne({ _id: `datasets:slug:${dataset.owner.type}:${dataset.owner.id}:${dataset.slug}` })
    ]
    const warnings = computeRealtimeWarnings(dataset, esInfos, config.elasticsearch)
    res.json({ filesInfos, esInfos, locks, warnings })
  })

  // Special admin route to force reindexing a dataset
  router.post('/:datasetId/_reindex', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const patchedDataset = await datasetUtils.reindex(mongo.db, reqDataset(req))
    res.status(200).send(patchedDataset)
  })

  // Special admin route to force refinalizing a dataset
  router.post('/:datasetId/_refinalize', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const patchedDataset = await datasetUtils.refinalize(mongo.db, reqDataset(req))
    res.status(200).send(patchedDataset)
  })

  // Special admin route to clear all locks on a dataset
  router.delete('/:datasetId/_lock', readDataset({ noCache: true }), async (req, res) => {
    const dataset = reqDataset(req)
    reqAdminMode(req)
    const db = mongo.db
    await db.collection<{ _id: string }>('locks').deleteOne({ _id: `datasets:${dataset.id}` })
    await db.collection<{ _id: string }>('locks').deleteOne({ _id: `datasets:slug:${dataset.owner.type}:${dataset.owner.id}:${dataset.slug}` })
    res.status(204).send()
  })
}
