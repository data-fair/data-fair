// CRUD operations on the lines of REST datasets (extracted from router.js, phase 6d)
import type { Router } from 'express'
import { readDataset, checkStorage, lockDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite, isRest, readWritableDataset } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as clamav from '../../misc/utils/clamav.ts'
import * as restDatasetsUtils from '../utils/rest.ts'
import * as uploadUtils from '../utils/upload.ts'

export const registerLinesRoutes = (router: Router) => {
  router.get('/:datasetId/lines/:lineId', readDataset(), isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readLine)
  router.post('/:datasetId/lines', readWritableDataset, isRest, applicationKey, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.createOrUpdateLine)
  router.put('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.createOrUpdateLine)
  router.patch('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, restDatasetsUtils.patchLine)
  router.post('/:datasetId/_bulk_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), checkStorage(false), restDatasetsUtils.uploadBulk, restDatasetsUtils.bulkLines)
  router.delete('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('deleteLine', 'write'), restDatasetsUtils.deleteLine)
  router.get('/:datasetId/lines/:lineId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)
  router.get('/:datasetId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, restDatasetsUtils.readRevisions)
  router.delete('/:datasetId/lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('deleteAllLines', 'write'), restDatasetsUtils.deleteAllLines)
  router.post('/:datasetId/_sync_attachments_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), restDatasetsUtils.syncAttachmentsLines)
}
