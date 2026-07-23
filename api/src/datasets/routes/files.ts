// File-download and metadata-attachment routes for a dataset (extracted from router.js, phase 6d)
import type { Router } from 'express'
import type { Dataset, RestDataset, QueryableDescendant } from '#types'
import { text as stream2text } from 'node:stream/consumers'
import path from 'path'
import moment from 'moment'
import resolvePath from 'resolve-path'
import contentDisposition from 'content-disposition'
import clone from '@data-fair/lib-utils/clone.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSession } from '@data-fair/lib-express'
import config from '#config'
import mongo from '#mongo'
import filesStorage from '#files-storage'
import { readDataset, reqDataset, checkStorage } from '../middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { reqOperation } from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as clamav from '../../misc/utils/clamav.ts'
import * as attachments from '../../misc/utils/metadata-attachments.ts'
import axios from '../../misc/utils/axios.ts'
import pump from '../../misc/utils/pipe.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../../misc/utils/publication-sites.ts'
import { memoizedGetDataset } from '../service.ts'
import * as datasetUtils from '../utils/index.ts'
import { dataFilesDir, attachmentsDir, validationDiagnosticFilePath, cancelledDraftDiagnosticFilePath } from '../utils/files.ts'
import { updateStorage } from '../utils/storage.ts'
import * as restDatasetsUtils from '../utils/rest.ts'
import * as outputs from '../utils/outputs.ts'
import { downloadFileFromStorage } from '../../files-storage/utils.ts'

export const registerFilesRoutes = (router: Router) => {
  // For datasets with attached files
  router.get('/:datasetId/attachments/*attachmentPath', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadAttachment', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    const attachmentPath = req.params.attachmentPath as string[]
    if (dataset.isVirtual) {
      const childDatasetId = attachmentPath[0]
      const descendants = (dataset as Dataset & { descendants?: QueryableDescendant[] }).descendants
      if (!descendants?.find(c => c.id === childDatasetId)) return res.status(404).send('Child dataset not found')
      const { dataset: childDataset } = await memoizedGetDataset(childDatasetId, reqPublicationSite(req), reqMainPublicationSite(req), false, false, false, mongo.db, undefined, undefined)
      const documentProp = (dataset.schema ?? []).find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      const childDocumentProp = childDataset.schema.find((p: any) => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      if (!documentProp || documentProp.key !== childDocumentProp.key) return res.status(404).send('No attachment column found')

      const relFilePath = path.join(...attachmentPath.slice(1))
      await downloadFileFromStorage(
        resolvePath(attachmentsDir(childDataset), relFilePath),
        req, res, { dispositionType: 'inline' })
    } else {
      // the transform stream option was patched into "send" module using patch-package
      const relFilePath = path.join(...attachmentPath)
      await downloadFileFromStorage(
        resolvePath(attachmentsDir(dataset), relFilePath),
        req, res, { dispositionType: 'inline' })
    }
  })

  // Direct access to data files
  router.get('/:datasetId/data-files', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('listDataFiles', 'read'), cacheHeaders.noCache, async (req, res, next) => {
    res.send(await datasetUtils.dataFiles(reqDataset(req), reqPublicBaseUrl(req)))
  })
  router.get('/:datasetId/data-files/*filePath', readDataset(), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadDataFile', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const relFilePath = path.join(...(req.params.filePath as string[]))
    await downloadFileFromStorage(
      resolvePath(dataFilesDir(reqDataset(req)), relFilePath), req, res)
  })

  // Special attachments referenced in dataset metadatas
  router.post('/:datasetId/metadata-attachments', readDataset({ noCache: true }), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('postMetadataAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), clamav.middleware, async (req, res, next) => {
    if (!req.file) throw httpError(400, 'no file was uploaded')
    req.body.size = req.file.size
    req.body.updatedAt = moment().toISOString()
    await updateStorage(reqDataset(req))
    res.status(200).send(req.body)
  })
  router.get('/:datasetId/metadata-attachments/*attachmentPath', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadMetadataAttachment', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    // the transform stream option was patched into "send" module using patch-package
    // res.set('content-disposition', `inline; filename="${req.params.attachmentPath}"`)
    const relFilePath = path.join(...(req.params.attachmentPath as string[]))
    const attachmentsTargets = clone((dataset as Dataset & { _attachmentsTargets?: any[] })._attachmentsTargets || [])
    const attachmentTarget = attachmentsTargets.find((a: any) => a.name === relFilePath)
    if (attachmentTarget) {
      // special case for remote attachments, we monitor them as if they were API call and not static files
      const operation = reqOperation(req)
      operation.track = 'readDataAPI'
      res.setHeader('x-operation', JSON.stringify(operation))
      if (attachmentTarget.fetchedAt && attachmentTarget.fetchedAt.getTime() + config.remoteAttachmentCacheDuration > Date.now()) {
        res.set('x-remote-status', 'CACHE')
      } else {
        const headers: Record<string, any> = {}
        if (attachmentTarget.etag) headers['If-None-Match'] = attachmentTarget.etag
        if (attachmentTarget.lastModified) headers['If-Modified-Since'] = attachmentTarget.lastModified
        try {
          const response = await axios.get(attachmentTarget.targetUrl, {
            responseType: 'stream',
            headers,
            validateStatus: function (status) {
              return status === 200 || status === 304
            }
          })
          if (response.status === 304) {
            // nothing to do
            res.set('x-remote-status', 'NOTMODIFIED')
            await stream2text(response.data)
          } else {
            res.set('x-remote-status', 'DOWNLOAD')
            const attachmentPath = datasetUtils.metadataAttachmentPath(dataset, relFilePath)
            // creating empty file before streaming seems to fix some weird bugs with NFS
            await filesStorage.writeStream(response.data, attachmentPath)
            attachmentTarget.etag = response.headers.etag
            attachmentTarget.lastModified = response.headers['last-modified']
            attachmentTarget.fetchedAt = new Date()
            await mongo.db.collection('datasets').updateOne({ id: dataset.id }, { $set: { _attachmentsTargets: attachmentsTargets } })
          }
        } catch (err: any) {
          let message = err.message ?? err
          if (err.response && err.response.status !== 200 && err.response.status !== 304) {
            message = `${err.response.status} - ${err.response.statusText}`
            if (err.response.headers['content-type']?.startsWith('text/plain')) {
              const data = await stream2text(err.response.data)
              if (data) message = data
            }
          }
          // we do not throw this error, we don't want to count it as an internal error
          console.warn('failed to fetch linked attachment', attachmentTarget.targetUrl, err)
          return res.status(502).send('Échec de téléchargement du fichier : ' + message)
        }
      }
    }

    await downloadFileFromStorage(
      resolvePath(datasetUtils.metadataAttachmentsDir(dataset), relFilePath),
      req, res, { dispositionType: 'inline' })
  })

  router.delete('/:datasetId/metadata-attachments/*attachmentPath', readDataset(), apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('deleteMetadataAttachment', 'write'), async (req, res, next) => {
    const dataset = reqDataset(req)
    await filesStorage.removeFile(datasetUtils.metadataAttachmentPath(dataset, path.join(...(req.params.attachmentPath as string[]))))
    await updateStorage(dataset)
    res.status(204).send()
  })

  // Download the full dataset in its original form
  router.get('/:datasetId/raw', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    const sessionState = reqSession(req)
    // a special case for superadmins.. handy but quite dangerous for the db load
    if (dataset.isRest && sessionState.user?.adminMode) {
      const query: any = { ...req.query }
      query.select = query.select || ['_id'].concat((dataset.schema ?? []).filter(f => !f['x-calculated']).map(f => f.key)).join(',')
      res.setHeader('content-disposition', contentDisposition(dataset.slug + '.csv'))
      // add BOM for excel, cf https://stackoverflow.com/a/17879474
      await pump(
        ...await restDatasetsUtils.readStreams(dataset as RestDataset),
        ...outputs.csvStreams(dataset, query),
        res
      )
      return
    }
    if (!dataset.originalFile) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
    await downloadFileFromStorage(datasetUtils.originalFilePath(dataset), req, res)
  })

  // Download the dataset in various formats
  router.get('/:datasetId/convert', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    if (!dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
    await downloadFileFromStorage(datasetUtils.filePath(dataset), req, res)
  })

  // Download the full dataset with extensions
  // TODO use ES scroll functionality instead of file read + extensions
  router.get('/:datasetId/full', readDataset({ noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('downloadFullData', 'read', 'readDataFiles'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    if (!dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
    if (await filesStorage.fileExists(datasetUtils.fullFilePath(dataset))) {
      await downloadFileFromStorage(datasetUtils.fullFilePath(dataset), req, res)
    } else {
      await downloadFileFromStorage(datasetUtils.filePath(dataset), req, res)
    }
  })

  // Download the validation diagnostic CSV. Same permission as the journal that
  // references it.
  router.get('/:datasetId/validation-diagnostic.csv', readDataset({ acceptInitialDraft: true, noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    const filePath = validationDiagnosticFilePath(dataset)
    if (!await filesStorage.fileExists(filePath)) {
      return res.status(404).type('text/plain').send('Aucun fichier de diagnostic disponible')
    }
    res.setHeader('content-disposition', contentDisposition(`${dataset.slug}-validation-diagnostic.csv`))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    await downloadFileFromStorage(filePath, req, res)
  })

  // Download the diagnostic of a contribution whose draft was auto-cancelled
  // (compatibleOrCancel). Stored in its own slot on the main dataset so it is not
  // confused with the live dataset's own validation diagnostic. Same permission gate.
  router.get('/:datasetId/cancelled-draft-diagnostic.csv', readDataset({ acceptInitialDraft: true, noCache: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readJournal', 'readAdvanced'), cacheHeaders.noCache, async (req, res, next) => {
    const dataset = reqDataset(req)
    const filePath = cancelledDraftDiagnosticFilePath(dataset)
    if (!await filesStorage.fileExists(filePath)) {
      return res.status(404).type('text/plain').send('Aucun fichier de diagnostic disponible')
    }
    res.setHeader('content-disposition', contentDisposition(`${dataset.slug}-cancelled-draft-diagnostic.csv`))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    await downloadFileFromStorage(filePath, req, res)
  })
}
