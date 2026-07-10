// specific routes for REST datasets with lineOwnership activated — own/:owner/* (extracted from router.js, phase 6d)
import type { Router, RequestHandler } from 'express'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import { readDataset, reqDataset, checkStorage, lockDataset, setReqLinesOwner } from '../middlewares.ts'
import { isRest, readWritableDataset } from './_common.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as apiKeyUtils from '../../misc/utils/api-key.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as restDatasetsUtils from '../utils/rest.ts'

// the rest line handlers are typed with RequestWithRestDataset (req.dataset is guaranteed by the
// readWritableDataset middleware upstream); alias to RequestHandler so they compose in the route chain
const readLine = restDatasetsUtils.readLine as RequestHandler
const createOrUpdateLine = restDatasetsUtils.createOrUpdateLine as RequestHandler
const patchLine = restDatasetsUtils.patchLine as RequestHandler
const deleteLine = restDatasetsUtils.deleteLine as RequestHandler
const bulkLines = restDatasetsUtils.bulkLines as RequestHandler
const readRevisions = restDatasetsUtils.readRevisions as RequestHandler

export const registerOwnLinesRoutes = (router: Router) => {
  router.use('/:datasetId/own/:owner', readWritableDataset, isRest, apiKeyUtils.middleware(['datasets']), rateLimiting.middleware, (req, res, next) => {
    const sessionState = reqSessionAuthenticated(req)
    if (!reqDataset(req).rest?.lineOwnership) {
      return res.status(501)
        .send('Les opérations de gestion des lignes par propriétaires ne sont pas supportées pour ce jeu de données.')
    }
    const [type, id, department] = (req.params.owner as string).split(':')
    const linesOwner: any = { type, id, department }
    setReqLinesOwner(req, linesOwner)
    if (!['organization', 'user'].includes(linesOwner.type)) return res.status(400).type('text/plain').send('ownerType must be user or organization')
    if (linesOwner.type === 'organization' && sessionState.account.type === 'organization' && sessionState.account.id === linesOwner.id && (sessionState.account.department || null) === (linesOwner.department || null)) {
      linesOwner.name = sessionState.account.name
      linesOwner.departmentName = sessionState.account.departmentName
      return next()
    }
    if (linesOwner.type === 'user' && sessionState.user.id === linesOwner.id) {
      linesOwner.name = sessionState.user.name
      return next()
    }
    if (sessionState.user.adminMode) return next()
    res.status(403).type('text/plain').send('only owner can manage his own lines')
  })
  router.get('/:datasetId/own/:owner/lines/:lineId', readDataset(), isRest, applicationKey, permissions.middleware('readOwnLine', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readLine)
  router.post('/:datasetId/own/:owner/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, createOrUpdateLine)
  router.put('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('updateOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, createOrUpdateLine)
  router.patch('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('patchOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, restDatasetsUtils.fixFormBody, patchLine)
  router.post('/:datasetId/own/:owner/_bulk_lines', lockDataset((body, query) => query.lock === 'true'), readWritableDataset, isRest, applicationKey, permissions.middleware('bulkOwnLines', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadBulk, bulkLines)
  router.delete('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('deleteOwnLine', 'manageOwnLines'), deleteLine)
  router.get('/:datasetId/own/:owner/lines/:lineId/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnLineRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readRevisions)
  router.get('/:datasetId/own/:owner/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readRevisions)
}
