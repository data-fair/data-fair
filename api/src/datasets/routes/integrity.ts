import { type Router } from 'express'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import { reqDataset, readDataset } from '../middlewares.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { isFileDataset } from '#types/dataset/index.ts'
import { integrityStore } from '../../integrity/store-factory.ts'
import { revisionPrefix, parseRevisionIndex, parseRevisionClass, stampHistorize, INTEGRITY_CLASSES, type IntegrityClass } from '../../integrity/operations.ts'

const originatorOf = (req: any): string => {
  const sessionState = reqSessionAuthenticated(req)
  return `user:${sessionState.user.id}`
}

export const registerIntegrityRoutes = (router: Router) => {
  router.put('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    const active = !!req.body?.active
    if (active) {
      if (!config.integrity?.active) throw httpError(400, 'integrity capability is not configured on this deployment')
      if (!isFileDataset(dataset) || !dataset.originalFile?.md5) throw httpError(400, 'integrity can only be enabled on a finalized file dataset')
      const update: any = {
        // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
        // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
        $set: { 'integrity.active': true, updatedAt: new Date().toISOString() }
      }
      stampHistorize(update, [...INTEGRITY_CLASSES], { operation: 'enable', originator: originatorOf(req) })
      await mongo.datasets.updateOne({ id: dataset.id }, update)
    } else {
      await mongo.datasets.updateOne({ id: dataset.id }, {
        $set: { 'integrity.active': false, updatedAt: new Date().toISOString() },
        // clear the verdicts and any pending relay work: a disabled dataset must not keep showing
        // a breach badge / error-filter listing it no longer allows acting on
        $unset: { 'integrity.file': '', 'integrity.metadata': '', _needsHistorizing: '' }
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
    const update: any = { $set: { updatedAt: new Date().toISOString() } }
    stampHistorize(update, [...INTEGRITY_CLASSES], { operation: 'fixIntegrity', originator: originatorOf(req) })
    await mongo.datasets.updateOne({ id: dataset.id }, update)
    res.status(204).send()
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
    const classes = (req.query.class === 'file' || req.query.class === 'metadata') ? [req.query.class as IntegrityClass] : INTEGRITY_CLASSES
    const revisions = (await Promise.all(classes.map((cls) => store.listRevisions(revisionPrefix(dataset.owner, dataset.id, cls))))).flat()
    revisions.sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0)) // newest first
    const count = revisions.length
    const size = Math.min(parseInt(String(req.query.size ?? '20'), 10) || 20, 100)
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1
    const pageRevisions = revisions.slice((page - 1) * size, (page - 1) * size + size)
    const results = await Promise.all(pageRevisions.map(async ({ key }) => {
      const rev = await store.getRevision(key)
      return {
        class: parseRevisionClass(key),
        i: parseRevisionIndex(key),
        hash: rev.hash,
        date: rev.context.date,
        operation: rev.context.operation,
        originator: rev.context.originator,
        ...(rev.context.reason ? { reason: rev.context.reason } : {})
      }
    }))
    res.json({ count, results })
  })
}
