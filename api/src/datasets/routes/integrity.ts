// Thin adapters for the integrity admin API (conventions §1): input extraction + service calls
// + response streaming only — the orchestration lives in api/src/integrity/service.ts.
import { type Router, type Request } from 'express'
import contentDisposition from 'content-disposition'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqDataset, readDataset } from '../middlewares.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as integrityService from '../../integrity/service.ts'
import { checkDataset } from '../../integrity/checker.ts'
import { whoFromReq } from '../../integrity/who.ts'
import pump from '../../misc/utils/pipe.ts'

const reqReason = (req: Request): string | undefined =>
  typeof req.body?.reason === 'string' ? req.body.reason : undefined

const reqRevisionIndex = (req: Request): number => {
  const i = parseInt(req.params.i as string, 10)
  if (Number.isNaN(i) || i < 0) throw httpError(400, 'invalid revision index')
  return i
}

const reqPagination = (req: Request): { page: number, size: number } => ({
  size: Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100),
  page: parseInt(String(req.query.page ?? '1'), 10) || 1
})

export const registerIntegrityRoutes = (router: Router) => {
  router.put('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset = reqDataset(req)
    const active = !!req.body?.active
    if (active) await integrityService.enableIntegrity(dataset, whoFromReq(req))
    else await integrityService.disableIntegrity(dataset, reqReason(req), whoFromReq(req))
    res.status(200).json({ active })
  })

  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), permissions.middleware('readIntegrity', 'admin'), async (req, res) => {
    res.json(await integrityService.getIntegrityState(reqDataset(req)))
  })

  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    res.json(await integrityService.fixIntegrity(reqDataset(req), reqReason(req), whoFromReq(req)))
  })

  router.post('/:datasetId/_integrity/_restore', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const i = req.body?.i
    if (!Number.isInteger(i) || i < 0) throw httpError(400, 'missing or invalid revision index "i"')
    res.json(await integrityService.restoreRevision(req.app, reqDataset(req), i, reqReason(req), reqSessionAuthenticated(req), req.getLocale(), whoFromReq(req)))
  })

  router.post('/:datasetId/_integrity/lines/_restore', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    res.json(await integrityService.restoreLines(reqDataset(req), reqReason(req), whoFromReq(req)))
  })

  router.post('/:datasetId/_integrity/trail/_ack', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    res.json(await integrityService.ackTrailAnomalies(reqDataset(req), reqReason(req), whoFromReq(req)))
  })

  router.get('/:datasetId/_integrity/lines/:lineId/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const { page, size } = reqPagination(req)
    res.json(await integrityService.listLineRevisions(reqDataset(req), req.params.lineId as string, page, size))
  })

  router.get('/:datasetId/_integrity/lines/:lineId/revisions/:i', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    res.json(await integrityService.getLineRevision(reqDataset(req), req.params.lineId as string, reqRevisionIndex(req)))
  })

  router.post('/:datasetId/_integrity/_check', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    // same per-dataset lock as the sweep and the other admin actions: a check racing a relay
    // would compare fresh content against a stale anchor and report a false breach.
    // ?deep=true re-verifies date coherence over the whole retention window (nightly checks
    // only verify incrementally past the trail cursor)
    res.json(await integrityService.withDatasetLock(dataset.id, () => checkDataset(dataset, { deep: req.query.deep === 'true' })))
  })

  router.get('/:datasetId/_integrity/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const { page, size } = reqPagination(req)
    res.json(await integrityService.listDatasetRevisions(reqDataset(req), page, size))
  })

  router.get('/:datasetId/_integrity/revisions/:i', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    res.json(await integrityService.getDatasetRevision(reqDataset(req), reqRevisionIndex(req)))
  })

  router.get('/:datasetId/_integrity/revisions/:i/file', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const { body, size, filename, mimetype } = await integrityService.readRevisionFile(reqDataset(req), reqRevisionIndex(req))
    res.setHeader('content-disposition', contentDisposition(filename))
    res.setHeader('content-type', mimetype)
    if (size !== undefined) res.setHeader('content-length', String(size))
    await pump(body, res)
  })
}
