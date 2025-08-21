import express from 'express'
import { Readable, Stream, Transform } from 'node:stream'
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
import pump from '../../../misc/utils/pipe.ts'
import * as outputs from '../../../datasets/utils/outputs.js'

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

const parseSelect = (fields, select, endpoint) => {
  // do not include by default heavy calculated fields used for indexing geo data
  const _source = (select && select !== '*' && typeof select === 'string')
    ? select.split(',')
    : fields.filter(key => !key.startsWith('_'))

  if (_source.some(s => s.includes(' as ') || s.includes(' AS '))) {
    compatReqCounter.inc({ endpoint, status: 'unsupported' })
    throw httpError(400, 'la syntaxe " as " n\'est pas supportée dans le paramètre "select" de cette couche de compatibilité pour la version d\'API précédente.')
  }
  const unknownField = _source.find(s => !fields.includes(s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données ou alors il correspond à une capacité d'aggrégation non supportée par cette couche de compatibilité pour la version d'API précédente.`)
  return _source
}

const parseOrderBy = (dataset, fields, query) => {
  const orderBy = query.order_by ? query.order_by.split(',') : []
  // recreate the sort string with our syntax
  const sortStr = orderBy.map(o => {
    const [field, order] = o.split(' ').filter(Boolean)
    return (order === 'desc' || order === 'DESC') ? ('-' + field) : field
  }).join(',')
  const sort: any[] = sortStr ? esUtils.parseSort(sortStr, fields, dataset) : []
  // implicitly sort by score after other criteria
  if (!sort.some(s => !!s._score) && query.where) sort.push('_score')
  // every other things equal, sort by original line order
  // this is very important as it provides a tie-breaker for search_after pagination
  if (fields.includes('_updatedAt')) {
    if (!sort.some(s => !!s._updatedAt)) sort.push({ _updatedAt: 'desc' })
    if (!sort.some(s => !!s._i)) sort.push({ _i: 'desc' })
  } else {
    if (!sort.some(s => !!s._i)) sort.push('_i')
  }
  if (dataset.isVirtual) {
    // _i is not a good enough tie-breaker in the case of virtual datasets
    if (!sort.some(s => !!s._rand)) sort.push('_rand')
  }

  return sort
}

const parseFilters = (dataset, query, endpoint) => {
  const filter: any[] = []
  const must: any[] = []
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
      compatReqCounter.inc({ endpoint, status: 'invalid-where' })
      throw httpError(400, 'le paramètre "where" est invalide : ' + err.message)
    }
  }

  return { bool: { filter, must, must_not: mustNot } }
}

const getRecords = async (req, res, next) => {
  (res as any).throttleEnd()

  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const esQuery: any = { track_total_hits: true }
  esQuery.size = query.limit ? Number(query.limit) : 20
  if (query.offset) esQuery.from = Number(query.offset)

  const fields = dataset.schema.map(f => f.key)
  esQuery._source = parseSelect(fields, query.select, 'records')
  esQuery.sort = parseOrderBy(dataset, fields, query)
  esQuery.query = parseFilters(dataset, query, 'records')

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
    const result = { results: [] as any[] }
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
      result.results.push(flatten(esResponse.hits.hits[i]._source))
    }
    compatReqCounter.inc({ endpoint: 'records', status: 'ok' })
    res.send(result)
  }
}

async function * iterHits (es, dataset, esQuery, totalSize = 50000) {
  const flatten = getFlatten(dataset, false, esQuery._source)

  let chunkSize = 1000
  if (totalSize !== -1 && totalSize < chunkSize) chunkSize = totalSize
  let remaining = totalSize
  while (true) {
    let size = chunkSize
    if (totalSize !== -1 && remaining < chunkSize) size = remaining
    const hits = (await es.search({
      index: esUtils.aliasName(dataset),
      body: { ...esQuery, size },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })).hits.hits
    yield hits.map(hit => flatten(hit._source))
    if (hits.length < chunkSize) break
    if (totalSize !== -1) {
      remaining -= hits.length
      if (remaining <= 0) break
    }
    esQuery.search_after = hits[hits.length - 1].sort
  }
}

const exports = async (req, res, next) => {
  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const esQuery: any = {}

  const fields = dataset.schema.map(f => f.key)
  esQuery._source = parseSelect(fields, query.select, 'exports')
  esQuery.sort = parseOrderBy(dataset, fields, query)
  esQuery.query = parseFilters(dataset, query, 'exports')

  let transformStreams: Stream[] = []
  if (req.params.format === 'csv') {
    res.setHeader('content-type', 'text/csv')
    transformStreams = outputs.csvStreams(req.dataset, query, query.use_labels === 'true')
  } else {
    compatReqCounter.inc({ endpoint: 'exports', status: 'unsupported' })
    throw httpError(400, `le format "${req.params.format}" n'est pas supporté par l'export de données de cette couche de compatibilité pour la version d'API précédente.`)
  }
  try {
    await pump(
      Readable.from(iterHits(esClient, dataset, esQuery, query.limit ? Number(query.limit) : -1)),
      new Transform({
        objectMode: true,
        transform (items, encoding, callback) {
          for (const item of items) this.push(item)
          callback(null)
        }
      }),
      ...transformStreams,
      res.throttle('dynamic'),
      res
    )
  } catch (err) {
    compatReqCounter.inc({ endpoint: 'exports', status: 'es-error' })
    const { message, status } = esUtils.extractError(err)
    console.warn('Error during streamed ods compat export', status, message)
    throw httpError(status, message)
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
router.get(
  '/v2.1/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  exports
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
datasetsRouter.get(
  '/:datasetId/compat-ods/exports/:format',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  exports
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ endpoint: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
