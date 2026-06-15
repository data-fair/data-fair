import { Router } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSession } from '@data-fair/lib-express'
import * as datasetUtils from '../datasets/utils/index.js'
import mongo from '#mongo'
import { findDatasets } from '../datasets/service.js'
import * as apiKeyUtils from '../misc/utils/api-key.ts'
import * as cacheHeaders from '../misc/utils/cache-headers.ts'
import { setReqResourceType } from '../misc/utils/permissions.ts'
import { reqPublicationSite, reqMainPublicationSite, setReqPublicationSite } from '../misc/utils/publication-sites.ts'
import { buildDcatCatalog } from './operations.ts'
import { findCatalogDatasets, getCatalogApiDocs } from './service.ts'

const apiKeyMiddlewareRead = apiKeyUtils.middleware(['datasets', 'datasets-read'])

const router = Router()
export default router

router.use((req, res, next) => {
  const mainPublicationSite = reqMainPublicationSite(req)
  if (mainPublicationSite) setReqPublicationSite(req, mainPublicationSite)
  if (!reqPublicationSite(req)) {
    return next(httpError(400, 'catalog API can only be used from a publication site, not the back-office'))
  }
  next()
})

router.get('/datasets', apiKeyMiddlewareRead, cacheHeaders.listBased, async (req, res) => {
  setReqResourceType(req, 'datasets')
  const response = await findDatasets(
    mongo.db,
    req.getLocale(),
    reqPublicationSite(req),
    req.publicBaseUrl,
    req.query,
    reqSession(req),
    { catalogMode: true }
  )
  for (const r of response.results) {
    datasetUtils.clean(req, r)
    delete r.publicationSites
    delete r.owner // TODO: dont delete it when owner is explicitly requested
  }
  res.json(response)
})

router.get('/api-docs.json', async (req, res) => {
  res.json(await getCatalogApiDocs(reqPublicationSite(req), req.publicBaseUrl))
})

router.get('/dcat', async (req, res) => {
  const publicationSite = reqPublicationSite(req)
  const datasets = await findCatalogDatasets(publicationSite, reqSession(req))
  res.type('application/ld+json')
  res.json(buildDcatCatalog(datasets, publicationSite, req.publicBaseUrl))
})
