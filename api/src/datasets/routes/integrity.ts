import { type Router } from 'express'
import { reqAdminMode } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import { reqDataset, readDataset } from '../middlewares.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { isFileDataset } from '#types/dataset/index.ts'
import { integrityStore } from '../../integrity/store-factory.ts'
import { revisionPrefix, parseRevisionIndex } from '../../integrity/operations.ts'
import { anchorDataset } from '../../integrity/relay.ts'

export const registerIntegrityRoutes = (router: Router) => {
  router.put('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    const active = !!req.body?.active
    if (active) {
      if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
      if (!isFileDataset(dataset) || !dataset.originalFile?.md5) throw httpError(400, 'integrity can only be enabled on a finalized file dataset')
      // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
      // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.active': true, updatedAt: new Date().toISOString() } })
      // anchor synchronously: enable is a rare superadmin action, and the response then reflects
      // the anchored state. On failure (S3 down) active stays true with no anchor — the check
      // reports 'unknown' and a later _fix retries (fail-loud, no compensating rollback).
      await anchorDataset(dataset, { operation: 'enable', origin: 'superadmin' })
    } else {
      await mongo.datasets.updateOne({ id: dataset.id }, {
        // clear the verdicts and any pending relay work: a disabled dataset must not keep showing
        // a breach badge / error-filter listing it no longer allows acting on
        $set: { integrity: { active: false }, updatedAt: new Date().toISOString() },
        $unset: { _needsHistorizing: '' }
      })
    }
    res.status(200).json({ active })
  })

  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), permissions.middleware('readIntegrity', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    res.json(dataset.integrity ?? { active: false })
  })

  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    // synchronous re-anchor + verify: the reconcile action responds with a fresh verdict
    await anchorDataset(dataset, { operation: 'fixIntegrity', origin: 'superadmin', reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined })
    // the synchronous anchor above just serviced whatever a pending stamp requested: clear it so
    // checkDataset's pending guard doesn't force an 'unknown' verdict on the fresh read below
    await mongo.datasets.updateOne({ id: dataset.id }, { $unset: { _needsHistorizing: '' } })
    const checker = await import('../../integrity/checker.ts')
    const fresh = await mongo.datasets.findOne({ id: dataset.id })
    res.json(await checker.checkDataset(fresh as any))
  })

  router.post('/:datasetId/_integrity/_check', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const checker = await import('../../integrity/checker.ts')
    res.json(await checker.checkDataset(dataset))
  })

  router.get('/:datasetId/_integrity/revisions', readDataset({ noCache: true }), permissions.middleware('readIntegrityRevisions', 'admin'), async (req, res) => {
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const store = integrityStore()
    // zero-padded indices sort lexically == numerically; newest first = reversed
    const keys = (await store.listRevisions(revisionPrefix(dataset.owner, dataset.id))).map((r) => r.key).sort().reverse()
    const count = keys.length
    const size = Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100)
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1
    const results = await Promise.all(keys.slice((page - 1) * size, (page - 1) * size + size).map(async (key) => {
      const rev = await store.getRevision(key)
      return {
        i: parseRevisionIndex(key),
        hash: rev.hash,
        date: rev.context.date,
        operation: rev.context.operation,
        origin: rev.context.origin,
        ...(rev.context.reason ? { reason: rev.context.reason } : {})
      }
    }))
    res.json({ count, results })
  })
}
