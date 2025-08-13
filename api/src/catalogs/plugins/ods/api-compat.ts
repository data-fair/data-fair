import express from 'express'
import * as permissions from '../../../misc/utils/permissions.ts'
import { readDataset } from '../../../datasets/middlewares.js'
import * as cacheHeaders from '../../../misc/utils/cache-headers.js'
import * as esUtils from '../../../datasets/es/index.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Counter } from 'prom-client'
import { getFlatten } from '../../../datasets/utils/flatten.ts'
import config from '#config'
import datasetsRouter, { datasetsApiKeyMiddleware } from '../../../datasets/router.js'
import { parse as parseWhere } from './where.peg.js'
import mongo from '#mongo'
import memoize from 'memoizee'

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

const getCompatODS = memoize(async (type: string, id: string) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type, id }, { projection: { compatODS: 1 } })
  return settings && settings.compatODS
}, {
  profileName: 'getCompatODS',
  promise: true,
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60, // 1 minute
})

const getRecords = async (req, res, next) => {
  (res as any).throttleEnd()

  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
  const publicBaseUrl = (req as any).publicBaseUrl as string
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const esQuery: any = {}
  esQuery.size = query.limit ? Number(query.limit) : 20
  if (query.offset) esQuery.from = Number(query.offset)

  // Select fields to return
  const fields = dataset.schema.map(f => f.key)
  // do not include by default heavy calculated fields used for indexing geo data
  esQuery._source = (query.select && query.select !== '*' && typeof query.select === 'string')
    ? query.select.split(',')
    : fields.filter(key => !key.startsWith('_'))
  if (esQuery._source.some(s => s.includes(' as ') || s.includes(' AS '))) {
    compatReqCounter.inc({ endpoint: 'records', status: 'unsupported' })
    throw httpError(400, 'la syntaxe " as " n\'est pas supportée dans le paramètre "select" de cette couche de compatibilité pour la version d\'API précédente.')
  }
  const unknownField = esQuery._source.find(s => !fields.includes(s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données ou alors il correspond à une capacité d'aggrégation non supportée par cette couche de compatibilité pour la version d'API précédente.`)

  const orderBy = query.order_by ? query.order_by.split(',') : []
  // recreate the sort string with our syntax
  const sortStr = orderBy.map(o => {
    const [field, order] = o.split(' ').filter(Boolean)
    return (order === 'desc' || order === 'DESC') ? ('-' + field) : field
  }).join(',')
  esQuery.sort = sortStr ? esUtils.parseSort(sortStr, fields, dataset) : []
  // implicitly sort by score after other criteria
  if (!esQuery.sort.some(s => !!s._score) && query.where) esQuery.sort.push('_score')
  // every other things equal, sort by original line order
  // this is very important as it provides a tie-breaker for search_after pagination
  if (fields.includes('_updatedAt')) {
    if (!esQuery.sort.some(s => !!s._updatedAt)) esQuery.sort.push({ _updatedAt: 'desc' })
    if (!esQuery.sort.some(s => !!s._i)) esQuery.sort.push({ _i: 'desc' })
  } else {
    if (!esQuery.sort.some(s => !!s._i)) esQuery.sort.push('_i')
  }
  if (dataset.isVirtual) {
    // _i is not a good enough tie-breaker in the case of virtual datasets
    if (!esQuery.sort.some(s => !!s._rand)) esQuery.sort.push('_rand')
  }

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

  const groupBy: string[] = query.group_by?.split(',')
  if (groupBy?.length) {
    for (const groupByKey of groupBy) {
      if (!fields.includes(groupByKey)) {
        compatReqCounter.inc({ endpoint: 'records', status: 'invalid-group-by' })
        throw httpError(400, `Impossible de grouper par le champ ${groupByKey}, il n'existe pas dans le jeu de données ou alors il correspond à une capacité d'aggrégation non supportée par cette couche de compatibilité pour la version d'API précédente.`)
      }
    }
    const bucketSort = {
      bucket_sort: {
        size: esQuery.size,
        from: esQuery.from
      }
    }
    if (groupBy.length > 1) {
      esQuery.aggs = {
        group_by: {
          multi_terms: {
            terms: groupBy.map(field => ({ field }))
          },
          aggs: {
            sort: bucketSort
          }
        }
      }
    } else {
      esQuery.aggs = {
        group_by: {
          terms: { field: groupBy[0] },
          aggs: {
            sort: bucketSort
          }
        }
      }
    }
    esQuery.size = 0
    delete esQuery.from
    delete esQuery._source
    delete esQuery.sort
  }

  const minimumShouldMatch = should.length ? 1 : 0
  esQuery.query = { bool: { filter, must, should, must_not: mustNot, minimum_should_match: minimumShouldMatch } }

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

  if (groupBy?.length) {
    const result = { results: [] }
    const buckets = esResponse.aggregations.group_by.buckets
    if (groupBy.length > 1) {
      for (const bucket of buckets) {
        const item: any = {}
        for (let i = 0; i < groupBy.length; i++) {
          item[groupBy[i]] = bucket.key[i]
        }
        result.results.push(item)
      }
    } else {
      for (const bucket of buckets) {
        const item: any = {}
        item[groupBy[0]] = bucket.key
        result.results.push(item)
      }
    }
    res.send(result)
  } else {
    const result = { total_count: esResponse.hits.total.value, results: [] as any[] }
    const flatten = getFlatten(dataset, false, esQuery._source)
    for (let i = 0; i < esResponse.hits.hits.length; i++) {
    // avoid blocking the event loop
      if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
      result.results.push(esUtils.prepareResultItem(esResponse.hits.hits[i], dataset, query, flatten, publicBaseUrl))
    }
    compatReqCounter.inc({ endpoint: 'records', status: 'ok' })
    res.send(result)
  }
}

// mimic ods api pattern to capture all deprecated traffic
router.get(
  '/v2.1/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords
)

// also expose the same endpoint on the datasets router to expose in the api doc
datasetsRouter.get(
  '/:datasetId/compat-ods/records',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ endpoint: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
