// CRUD operations on the lines of REST datasets (extracted from router.js, phase 6d)
import type { Router, RequestHandler } from 'express'
import { readDataset, checkStorage, lockDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead, apiKeyMiddlewareWrite, isRest, readWritableDataset } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as clamav from '../../misc/utils/clamav.ts'
import * as restDatasetsUtils from '../utils/rest.ts'
import * as uploadUtils from '../utils/upload.ts'

// the rest line handlers are typed with RequestWithRestDataset (req.dataset is guaranteed by the
// readWritableDataset middleware upstream); alias to RequestHandler so they compose in the route chain
const readLine = restDatasetsUtils.readLine as RequestHandler
const createOrUpdateLine = restDatasetsUtils.createOrUpdateLine as RequestHandler
const patchLine = restDatasetsUtils.patchLine as RequestHandler
const deleteLine = restDatasetsUtils.deleteLine as RequestHandler
const bulkLines = restDatasetsUtils.bulkLines as RequestHandler
const readRevisions = restDatasetsUtils.readRevisions as RequestHandler
const deleteAllLines = restDatasetsUtils.deleteAllLines as RequestHandler
const syncAttachmentsLines = restDatasetsUtils.syncAttachmentsLines as RequestHandler

export const registerLinesRoutes = (router: Router) => {
  router.get('/:datasetId/lines/:lineId', readDataset(), isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, readLine)
  router.post('/:datasetId/lines', readWritableDataset, isRest, applicationKey, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, createOrUpdateLine)
  router.put('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, createOrUpdateLine)
  router.patch('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, uploadUtils.fsyncFiles, clamav.middleware, patchLine)
  router.post('/:datasetId/_bulk_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), checkStorage(false), restDatasetsUtils.uploadBulk, bulkLines)
  router.delete('/:datasetId/lines/:lineId', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('deleteLine', 'write'), deleteLine)
  router.get('/:datasetId/lines/:lineId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, readRevisions)
  router.get('/:datasetId/revisions', readWritableDataset, isRest, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, readRevisions)
  router.delete('/:datasetId/lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('deleteAllLines', 'write'), deleteAllLines)
  router.post('/:datasetId/_sync_attachments_lines', readWritableDataset, isRest, apiKeyMiddlewareWrite, rateLimiting.middleware, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), syncAttachmentsLines)
}
