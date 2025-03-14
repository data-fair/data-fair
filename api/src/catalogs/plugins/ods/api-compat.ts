import express from 'express'
import * as permissions from '../../../misc/utils/permissions.js'
import { readDataset } from '../../../datasets/middlewares.js'
import * as cacheHeaders from '../../../misc/utils/cache-headers.js'
import * as esUtils from '../../../datasets/es/index.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Counter } from 'prom-client'
import { getFlatten } from '../../../datasets/utils/flatten.ts'
import config from '#config'
import datasetsRouter from '../../../datasets/router.js'
import { parse as parseWhere } from './where.peg.js'

const compatReqCounter = new Counter({
  name: 'df_compat_ods_req',
  help: 'A counter of the usage of the ods compatibility layer.',
  labelNames: ['endpoint', 'status']
})

const router = express.Router()

router.use('/v2.1/catalog/datasets', (req, res, next) => {
  // @ts-ignore
  req.resourceType = 'datasets'
  next()
})

const getRecords = async (req, res, next) => {
  (res as any).throttleEnd()
  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
  const publicBaseUrl = (req as any).publicBaseUrl as string
  const query = req.query

  // first reject unsupported parameters
  if (query.group_by) {
    compatReqCounter.inc({ endpoint: 'records', status: 'unsupported' })
    throw httpError(400, 'le paramètre "group_by" n\'est pas supporté par cette couche de compatibilité pour la version d\'API précédente.')
  }
  if (query.order_by) {
    compatReqCounter.inc({ endpoint: 'records', status: 'unsupported' })
    throw httpError(400, 'le paramètre "order_by" n\'est pas supporté par cette couche de compatibilité pour la version d\'API précédente.')
  }

  const esQuery: any = {}
  esQuery.size = query.limit ? Number(query.limit) : 20
  if (query.offset) esQuery.from = Number(query.offset)

  // Select fields to return
  const fields = dataset.schema.map(f => f.key)
  // do not include by default heavy calculated fields used for indexing geo data
  esQuery._source = (query.select && query.select !== '*' && typeof query.select === 'string')
    ? query.select.split(',')
    : fields.filter(key => key !== '_geoshape' && key !== '_geocorners')
  if (esQuery._source.some(s => s.includes(' as ') || s.includes(' AS '))) {
    compatReqCounter.inc({ endpoint: 'records', status: 'unsupported' })
    throw httpError(400, 'la syntaxe " as " n\'est pas supportée dans le paramètre "select" de cette couche de compatibilité pour la version d\'API précédente.')
  }
  const unknownField = esQuery._source.find(s => !fields.includes(s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données ou alors il correspond à une capacité d'aggrégation non supportée par cette couche de compatibilité pour la version d'API précédente.`)

  const filter: any[] = []
  const must: any[] = []
  const should: any[] = []
  const mustNot: any[] = []

  // Enforced static filters from virtual datasets
  if (dataset.virtual && dataset.virtual.filters) {
    for (const f of dataset.virtual.filters) {
      if (f.values && f.values.length) {
        if (f.values.length === 1) filter.push({ term: { [f.key]: f.values[0] } })
        else filter.push({ terms: { [f.key]: f.values } })
      }
    }
  }

  // Envorced filter in case of rest datasets with line ownership
  if (query.owner) {
    filter.push({ term: { _owner: query.owner } })
  }

  if (query.where) {
    const { searchFields } = esUtils.getFilterableFields(dataset)
    try {
      must.push(parseWhere(query.where, { searchFields, dataset }))
    } catch (err: any) {
      compatReqCounter.inc({ endpoint: 'records', status: 'invalid-where' })
      throw httpError(400, 'le paramètre "where" est invalide : ' + err.message)
    }
  }

  const minimumShouldMatch = should.length ? 1 : 0
  esQuery.query = { bool: { filter, must, should, mustNot, minimum_should_match: minimumShouldMatch } }

  let esResponse: any
  try {
    esResponse = await esClient.search({
      index: esUtils.aliasName(dataset),
      body: esQuery,
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })
  } catch (err) {
    compatReqCounter.inc({ endpoint: 'records', status: 'es-error' })
    const { message, status } = esUtils.extractError(err)
    throw httpError(status, message)
  }

  const result = { total_count: esResponse.hits.total.value, results: [] as any[] }
  const flatten = getFlatten(dataset)
  for (let i = 0; i < esResponse.hits.hits.length; i++) {
    // avoid blocking the event loop
    if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
    result.results.push(esUtils.prepareResultItem(esResponse.hits.hits[i], dataset, query, flatten, publicBaseUrl))
  }

  compatReqCounter.inc({ endpoint: 'records', status: 'ok' })
  res.send(result)
}

// mimic ods api pattern to capture all deprecated traffic
router.get(
  '/v2.1/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords
)

// also expose the same endpoint on the datasets router to expose in the api doc
datasetsRouter.get(
  '/:datasetId/compat-ods/records',
  readDataset({ fillDescendants: true }),
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ endpoint: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
