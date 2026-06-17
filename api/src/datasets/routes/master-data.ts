// Specific routes for datasets with masterData functionalities enabled (extracted from router.js, phase 6d)
import type { Router } from 'express'
import { readDataset, reqDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead } from './_common.ts'
import { manageESError } from './_es-error.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as esUtils from '../es/index.ts'
import { getFlatten } from '../utils/flatten.ts'
import pump from '../../misc/utils/pipe.ts'
import { bulkSearchStreams } from '../utils/master-data.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'

export const registerMasterDataRoutes = (router: Router) => {
  router.get('/:datasetId/master-data/single-searchs/:singleSearchId', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLines', 'read', 'readDataAPI'), async (req, res) => {
    const dataset = reqDataset(req)
    const singleSearch: any = dataset.masterData && dataset.masterData.singleSearchs && dataset.masterData.singleSearchs.find(ss => ss.id === req.params.singleSearchId)
    if (!singleSearch) return res.status(404).send(`Recherche unitaire "${req.params.singleSearchId}" inconnue`)

    let esResponse: any
    let select = singleSearch.output.key
    if (singleSearch.label) select += ',' + singleSearch.label.key
    // collapse on the output key so suggestions are deduplicated server-side
    // (the underlying dataset may have multiple rows sharing the same output value)
    const params: any = { q: req.query.q, size: req.query.size, q_mode: 'complete', select, collapse: singleSearch.output.key }
    const qs = []

    if (singleSearch.filters) {
      for (const f of singleSearch.filters) {
        if (f.property?.key && f.values?.length) {
          qs.push(f.values.map((value: any) => `(${esUtils.escapeFilter(f.property.key)}:"${esUtils.escapeFilter(value)}")`).join(' OR '))
        }
      }
    }
    if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    try {
      esResponse = await esUtils.search(req.app.get('es'), dataset, params, undefined, undefined, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    const flatten = getFlatten(dataset)
    const resultCtx = esUtils.prepareResultContext(dataset, req.query)
    const result = {
      total: esResponse.hits.total?.value,
      results: esResponse.hits.hits.map((hit: any) => {
        const item = esUtils.prepareResultItem(hit, dataset, req.query, flatten, reqPublicBaseUrl(req), resultCtx)
        let label = item[singleSearch.output.key]
        if (singleSearch.label && item[singleSearch.label.key]) label += ` (${item[singleSearch.label.key]})`
        return { output: item[singleSearch.output.key], label, score: item._score || undefined }
      })
    }
    res.send(result)
  })
  router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset({ fillDescendants: true }), apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('bulkSearch', 'read'), async (req, res) => {
    const dataset = reqDataset(req)
    // no buffering of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'no')
    const flatten = getFlatten(dataset)
    await pump(
      req,
      ...await bulkSearchStreams(dataset, req.get('Content-Type') as string, req.params.bulkSearchId as string, req.query.select as string, flatten),
      res
    )
  })
}
