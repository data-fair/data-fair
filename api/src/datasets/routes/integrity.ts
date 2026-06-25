import { type Router } from 'express'
import { reqAdminMode, reqSessionAuthenticated } from '@data-fair/lib-express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import { reqDataset, readDataset } from '../middlewares.ts'
import { isFileDataset } from '#types/dataset/index.ts'

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
      await mongo.datasets.updateOne({ id: dataset.id }, {
        // bump updatedAt so the dataset read-cache (getDatasetFresh) detects the change; a raw
        // updateOne leaves updatedAt untouched and reads then serve a stale doc without integrity.active
        $set: { 'integrity.active': true, _needsHistorizing: true, _historizeContext: { operation: 'enable', originator: originatorOf(req) }, updatedAt: new Date().toISOString() }
      })
    } else {
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'integrity.active': false, updatedAt: new Date().toISOString() } })
    }
    res.status(200).json({ active })
  })

  router.get('/:datasetId/_integrity', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    res.json(dataset.integrity ?? { active: false })
  })

  router.post('/:datasetId/_integrity/_fix', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    await mongo.datasets.updateOne({ id: dataset.id }, {
      $set: { _needsHistorizing: true, _historizeContext: { operation: 'fixIntegrity', originator: originatorOf(req) }, updatedAt: new Date().toISOString() }
    })
    res.status(204).send()
  })

  router.post('/:datasetId/_integrity/_check', readDataset({ noCache: true }), async (req, res) => {
    reqAdminMode(req)
    const dataset: any = reqDataset(req)
    if (!dataset.integrity?.active) throw httpError(400, 'integrity is not active on this dataset')
    const checker = await import('../../integrity/checker.ts')
    res.json(await checker.checkDataset(dataset))
  })
}
