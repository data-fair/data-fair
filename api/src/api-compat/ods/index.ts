import express from 'express'
import { Readable, Stream, Transform } from 'node:stream'
import * as permissions from '../../misc/utils/permissions.ts'
import { readDataset, reqDataset } from '../../datasets/middlewares.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import * as esUtils from '../../datasets/es/index.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { getFlatten } from '../../datasets/utils/flatten.ts'
import config from '#config'
import datasetsRouter from '../../datasets/router.ts'
import { apiKeyMiddlewareRead } from '../../datasets/routes/_common.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import mongo from '#mongo'
import memoize from 'memoizee'
import pump from '../../misc/utils/pipe.ts'
import { stringify as csvStrStream, type Options as CsvOptions } from 'csv-stringify'
import contentDisposition from 'content-disposition'
import JSONStream from 'JSONStream'
import type { DatasetInternal } from '#types'
import { queryAdvice } from '../../misc/utils/query-advice.ts'
import { compatReqCounter, logCompatODSError, prepareEsQuery, prepareResult, applyAliases, sortBuckets, prepareBucketResult } from './operations.ts'

const router = express.Router()

router.use('/v2.1/catalog/datasets', (req, res, next) => {
  permissions.setReqResourceType(req, 'datasets')
  next()
})
router.use('/v2.0/catalog/datasets', (req, res, next) => {
  permissions.setReqResourceType(req, 'datasets')
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

const getRecords = (version: '2.0' | '2.1') => async (req, res, next) => {
  (res as any).throttleEnd()

  const esClient = req.app.get('es') as any
  const dataset = reqDataset(req)
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const { grouped, size, from, esQuery, selectAggs, selectSource, selectTransforms, aliases, sort, composite } = prepareEsQuery(dataset, query, 'records')

  if (grouped) {
    if (size > 20000) throw httpError(400, 'limit should be less than 20000')
    if (size + from > 20000) throw httpError(400, 'offset+limit should be less than 20000')
  } else {
    if (size > 100) throw httpError(400, 'limit should be less than 100')
    if (size + from > 10000) throw httpError(400, 'offset+limit should be less than 10000')
  }

  // abort the ES search if the http client goes away; also bounds the request with a read-side timeout
  const esAbortContext = esUtils.createEsRequestOptions(req, res)
  let esResponse: any
  try {
    esResponse = await esClient.search({
      index: esUtils.aliasName(dataset),
      body: esQuery,
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    }, esAbortContext)
  } catch (err) {
    const { message, status } = esUtils.extractError(err)
    // 499 = the http client gave up, the query was aborted: nothing to log or report
    if (status !== 499) logCompatODSError(message, req.url, 'records', 'es-error', dataset.id)
    throw httpError(status, (status === 504 || status === 429) ? message + queryAdvice(req) : message)
  }

  if (grouped) {
    const buckets: any[] = esResponse.aggregations.___group_by.buckets
    sortBuckets(buckets, sort)
    const bucketsPage = buckets.slice(from, from + size)
    const results: any[] = []
    for (const bucket of bucketsPage) {
      const result = prepareBucketResult(dataset, bucket, selectAggs, composite)
      applyAliases(result, aliases, selectTransforms, query.timezone)
      results.push(result)
    }
    // compatReqCounter.inc({ route: 'records', status: 'ok' })
    res.send({ total_count: buckets.length, results })
  } else {
    const result = { total_count: esResponse.hits.total.value, results: [] as any[] }
    const flatten = getFlatten(dataset, true, selectSource)
    for (let i = 0; i < esResponse.hits.hits.length; i++) {
      // avoid blocking the event loop
      if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
      const line = flatten(esResponse.hits.hits[i]._source)
      prepareResult(dataset, line, esResponse.aggregations, req.query.timezone)
      applyAliases(line, aliases, selectTransforms, query.timezone)
      result.results.push(line)
    }
    // compatReqCounter.inc({ route: 'records', status: 'ok' })
    res.send(result)
  }
}

const maxChunkSize = 1000

async function * iterHits (es, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, totalSize, grouped, composite, timezone = 'utc', preserveArrays = false, abortContext?: esUtils.EsAbortContext) {
  const flatten = getFlatten(dataset, preserveArrays, selectSource)

  let chunkSize = maxChunkSize
  if (totalSize !== -1 && totalSize < maxChunkSize) chunkSize = totalSize
  let remaining = totalSize
  while (true) {
    let size = chunkSize
    if (totalSize !== -1 && remaining < chunkSize) size = remaining
    const esResponse = (await es.search({
      index: esUtils.aliasName(dataset),
      body: { ...esQuery, size },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    }, abortContext))

    const lines = []
    if (grouped) {
      const buckets: any[] = esResponse.aggregations.___group_by.buckets
      for (const bucket of buckets) {
        const result = prepareBucketResult(dataset, bucket, selectAggs, composite)
        applyAliases(result, aliases, selectTransforms, timezone)
        lines.push(result)
      }

      esQuery.aggs.___group_by.composite.after = esResponse.aggregations.___group_by.after_key
    } else {
      const hits = esResponse.hits.hits
      for (const hit of hits) {
        const line = flatten(hit._source)
        prepareResult(dataset, line, esResponse.aggregations, timezone)
        applyAliases(line, aliases, selectTransforms, timezone)
        lines.push(line)
      }
      esQuery.search_after = hits[hits.length - 1]?.sort
    }
    yield lines
    if (lines.length < chunkSize) break
    if (totalSize !== -1) {
      remaining -= lines.length
      if (remaining <= 0) break
    }
  }
}

const exports = (version: '2.0' | '2.1') => async (req, res, next) => {
  res.setHeader('X-Accel-Buffering', 'no')
  const esClient = req.app.get('es') as any
  const dataset = reqDataset(req) as DatasetInternal
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!dataset.schema) throw httpError(404, 'dataset without data')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const { grouped, from, esQuery, selectAggs, selectSource, selectFinalKeys, selectTransforms, aliases, composite } = prepareEsQuery(dataset, query, 'exports')

  if (from) throw httpError(400, 'offset parameter is not supported for exports')

  // abort the streaming ES iteration as soon as the http client goes away — without this, iterHits
  // keeps paging from ES while csv-stringify / format streams keep buffering parsed rows in memory
  // until server.requestTimeout (15 min) fires. The AbortController fires on res 'close' (unless
  // writableEnded), cancels the in-flight ES search, and the iterHits generator throws AbortError
  // → pump tears the pipeline down, releasing every batch/Buffer along the way.
  const esAbortContext = esUtils.createEsRequestOptions(req, res)

  if (req.params.format === 'geojson') {
    const geoshapeProp = dataset.schema.find(p => p.key === '_geoshape')
    if (!esQuery._source.includes('_geoshape') && geoshapeProp) {
      esQuery._source.push('_geoshape')
    }
    if (!esQuery._source.includes('_geopoint')) esQuery._source.push('_geopoint')
  }

  const useLabels = query.use_labels === 'true'
  let transformStreams: Stream[] = []
  let preserveArrays = true

  // full potential list:
  // "csv" "fgb" "geojson" "gpx" "json" "jsonl" "jsonld" "kml" "n3" "ov2" "parquet" "rdfxml" "shp" "turtle" "xlsx"

  const columns = selectFinalKeys.map(key => {
    const field = dataset.schema?.find(p => p.key === key)
    if (field) return { key: field.key, header: (useLabels ? field.title : field.key) || field.key }
    else return { key, header: key }
  })

  if (req.params.format === 'csv') {
    // https://help.opendatasoft.com/apis/ods-explore-v2/#tag/Dataset/operation/exportRecordsCSV
    res.type('csv')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.csv'))
    const options: CsvOptions = {
      columns,
      header: true,
      quoted_string: req.query.quote_all === 'true',
      delimiter: req.query.delimiter ?? ';',
      cast: {
        boolean: (value) => {
          if (value) return '1'
          if (value === false) return '0'
          return ''
        }
      }
    }
    if (version === '2.0') options.bom = req.query.with_bom === 'true'
    else options.bom = req.query.with_bom !== 'false'
    transformStreams = [csvStrStream(options)]
    preserveArrays = false
  } else if (req.params.format === 'xlsx') {
    // res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.type('xlsx')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.xlsx'))
    const { default: Excel } = await import('exceljs')
    try {
      const workbookWriter = new Excel.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: true
      })
      const worksheet = workbookWriter.addWorksheet('Feuille 1')
      // Define columns (optional)
      worksheet.columns = columns
      const iter = iterHits(esClient, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, query.limit ? Number(query.limit) : -1, grouped, composite, query.timezone, false, esAbortContext)
      for await (const items of iter) {
        for (const item of items) {
          worksheet.addRow(item).commit()
        }
      }
      worksheet.commit()
      await workbookWriter.commit()
      // compatReqCounter.inc({ route: 'exports', status: 'ok' })
    } catch (err) {
      const { message, status } = esUtils.extractError(err)
      // 499 = the http client gave up, the search was aborted: nothing to log or report
      if (status !== 499) logCompatODSError(err, req.url, 'exports', 'xlsx-error', dataset.id)
      throw httpError(status, (status === 504 || status === 429) ? message + queryAdvice(req) : message)
    }
    // return early, xlsx export is written directly ro response,
    // it does not create a transform stream
    return

    /* let i = 0
    transformStreams = [
      new Transform({
        objectMode: true,
        transform (item, encoding, callback) {
          if (i === 0) {
            const properties = esQuery._source.map(key => dataset.schema.find(prop => prop.key === key))
            this.push(properties.map(field => (useLabels ? field.title : field['x-originalName']) || field['x-originalName'] || field.key))
          }
          this.push(esQuery._source.map(key => {
            if (item[key] === null || item[key] === undefined) return undefined
            if (typeof item[key] === 'number' || typeof item[key] === 'string') return item[key]
            return '' + item[key]
          }))
          i++
          callback()
        }
      }),
      new XLSXTransformStream()] */
  } else if (req.params.format === 'parquet') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.parquet'))
    res.type(('application/vnd.apache.parquet'))
    // const parquet = await import('@dsnp/parquetjs')
    // TODO: should we flatten or nest multi-valued values ?
    // const schema = jsonSchema(dataset.schema, req.publicBaseUrl, false)
    // const parquetSchema = parquet.ParquetSchema.fromJsonSchema(schema)
    // transformStreams = [new parquet.ParquetTransformer(parquetSchema)]
    const { ParquetWriterStream } = await import('../../../../parquet-writer/parquet-writer-stream.mts')
    const basicSchema = selectFinalKeys.map((key: string) => {
      const prop = dataset.schema!.find(p => p.key === key)!
      if (prop) return { key: prop.key, type: prop.type as string, format: prop.format ?? undefined, required: prop['x-required'] }
      return { key, type: 'string' }
    })
    transformStreams = [new ParquetWriterStream(basicSchema)]
    preserveArrays = false
  } else if (req.params.format === 'json') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.json'))
    res.type('json')
    // TODO: should we flatten or nest multi-valued values ?
    transformStreams = [JSONStream.stringify('[', ',', ']')]
  } else if (req.params.format === 'jsonl') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.jsonl'))
    res.type('application/jsonl; charset=utf-8')
    // TODO: should we flatten or nest multi-valued values ?
    transformStreams = [
      new Transform({
        objectMode: true,
        transform (item, encoding, callback) {
          callback(null, JSON.stringify(item) + '\n')
        }
      })
    ]
  } else if (req.params.format === 'geojson') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.geojson'))
    res.type('geojson')
    transformStreams = [
      new Transform({
        objectMode: true,
        transform (properties, encoding, callback) {
          let geometry = properties._geoshape
          delete properties._geoshape
          if (!geometry && properties._geopoint) {
            const [lat, lon] = properties._geopoint.split(',')
            delete properties._geopoint
            geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
          }
          callback(null, { type: 'Feature', geometry, properties })
        }
      }),
      JSONStream.stringify('{"type":"FeatureCollection","features": [', ',', ']}')
    ]
  } else {
    compatReqCounter.inc({ route: 'exports', status: 'unsupported' })
    throw httpError(400, `le format "${req.params.format}" n'est pas supporté par l'export de données de cette couche de compatibilité pour la version d'API précédente.`)
  }
  try {
    await pump(
      // tight hwm: iterHits yields whole batches (~1000 hits each). With the default object-mode
      // hwm of 16 the upstream readable + downstream writable would pre-buffer up to ~32 batches
      // (~32 000 hits) per stuck/slow stream — concurrent slow consumers multiply that into GiBs of
      // retained external memory. Keep ~1-2 batches in flight instead.
      Readable.from(iterHits(esClient, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, query.limit ? Number(query.limit) : -1, grouped, composite, query.timezone, preserveArrays, esAbortContext), { highWaterMark: 2 }),
      new Transform({
        objectMode: true,
        writableHighWaterMark: 2,
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
    const { message, status } = esUtils.extractError(err)
    // 499 = the http client gave up, the search was aborted: nothing to log or report
    if (status !== 499) logCompatODSError(err, req.url, 'exports', 'stream-error', dataset.id)
    throw httpError(status, (status === 504 || status === 429) ? message + queryAdvice(req) : message)
  }
  // compatReqCounter.inc({ route: 'exports', status: 'ok' })
}

// mimic ods api pattern to capture all deprecated traffic
const cacheNowMiddleware = (req, res, next) => {
  if (req.url.includes('now(')) cacheHeaders.setReqNoModifiedCache(req, true)
  next()
}
router.get(
  '/v2.1/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheNowMiddleware,
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheNowMiddleware,
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.0')
)
router.get(
  '/v2.1/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.0')
)

// also expose the same endpoint on the datasets router to expose in the api doc
datasetsRouter.get(
  '/:datasetId/compat-ods/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheNowMiddleware,
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.1')
)
datasetsRouter.get(
  '/:datasetId/compat-ods/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  rateLimiting.middleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheNowMiddleware,
  cacheHeaders.resourceBased('finalizedAt'),
  exports('2.1')
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ route: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
