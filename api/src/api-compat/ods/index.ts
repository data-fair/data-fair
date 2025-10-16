import express from 'express'
import { Readable, Stream, Transform } from 'node:stream'
import * as permissions from '../../misc/utils/permissions.ts'
import { readDataset } from '../../datasets/middlewares.js'
import * as cacheHeaders from '../../misc/utils/cache-headers.js'
import * as esUtils from '../../datasets/es/index.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Counter } from 'prom-client'
import { getFlatten } from '../../datasets/utils/flatten.ts'
import config from '#config'
import datasetsRouter, { datasetsApiKeyMiddleware } from '../../datasets/router.js'
import { parse as parseWhere } from './where.peg.js'
import { parse as parseSelect } from './select.peg.js'
import { parse as parseOrderBy } from './order-by.peg.js'
import mongo from '#mongo'
import memoize from 'memoizee'
import pump from '../../misc/utils/pipe.ts'
import { stringify as csvStrStream, type Options as CsvOptions } from 'csv-stringify'
import { csvStringifyOptions } from '../../datasets/utils/outputs.js'
import contentDisposition from 'content-disposition'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import JSONStream from 'JSONStream'
import capabilities from '../../../contract/capabilities.js'
import type { DatasetInternal } from '#types'

dayjs.extend(timezone)
dayjs.extend(utc)

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
router.use('/v2.0/catalog/datasets', (req, res, next) => {
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

/*
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
  */

const completeSort = (dataset, sort, query) => {
  // implicitly sort by score after other criteria
  if (!sort.some(s => !!s._score) && query.where) sort.push('_score')
  // every other things equal, sort by original line order
  // this is very important as it provides a tie-breaker for search_after pagination
  if (dataset.schema.some(p => p.key === '_updatedAt')) {
    if (!sort.some(s => !!s._updatedAt)) sort.push({ _updatedAt: 'desc' })
    if (!sort.some(s => !!s._i)) sort.push({ _i: 'desc' })
  } else {
    if (!sort.some(s => !!s._i)) sort.push('_i')
  }
  if (dataset.isVirtual) {
    // _i is not a good enough tie-breaker in the case of virtual datasets
    if (!sort.some(s => !!s._rand)) sort.push('_rand')
  }
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
    const { searchFields, wildcardFields } = esUtils.getFilterableFields(dataset)
    try {
      must.push(parseWhere(query.where, { searchFields, wildcardFields, dataset }))
    } catch (err: any) {
      compatReqCounter.inc({ endpoint, status: 'invalid-where' })
      throw httpError(400, 'le paramètre "where" est invalide : ' + err.message)
    }
  }

  if (query.refine) {
    const sep = query.refine.includes(':') ? ':' : '.'
    const [key, ...valueParts] = query.refine.split(sep)
    const prop = dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre refine sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    const value = valueParts.join(':')
    if (prop.type === 'string' && (prop.format === 'date' || prop.format === 'date-time')) {
      let startDate, endDate
      if (value.length === 10) {
        let date = dayjs.tz(value, 'YYYY-MM-DD', query.timezone ?? 'UTC')
        if (!date.isValid()) date = dayjs.tz(value, 'YYYY/MM/DD', query.timezone ?? 'UTC')
        if (!date.isValid()) throw httpError(400, `Impossible d'appliquer le filtre refine sur le champ ${key}, date non valide ${value}.`)
        startDate = date.toISOString()
        endDate = date.endOf('day').toISOString()
      }
      if (value.length === 7) {
        let date = dayjs.tz(value, 'YYYY-MM', query.timezone ?? 'UTC')
        if (!date.isValid()) date = dayjs.tz(value, 'YYYY/MM', query.timezone ?? 'UTC')
        if (!date.isValid()) throw httpError(400, `Impossible d'appliquer le filtre refine sur le champ ${key}, date non valide ${value}.`)
        startDate = date.toISOString()
        endDate = date.endOf('month').toISOString()
      }
      if (value.length === 4) {
        let date = dayjs.tz(value, 'YYYY', query.timezone ?? 'UTC')
        if (!date.isValid()) date = dayjs.tz(value, 'YYYY', query.timezone ?? 'UTC')
        if (!date.isValid()) throw httpError(400, `Impossible d'appliquer le filtre refine sur le champ ${key}, date non valide ${value}.`)
        startDate = date.toISOString()
        endDate = date.endOf('year').toISOString()
      }
      filter.push({ range: { [key]: { gte: startDate, lte: endDate } } })
    } else {
      filter.push({ term: { [key]: value } })
    }
  }

  return { bool: { filter, must, must_not: mustNot } }
}

const isoWithOffset = 'YYYY-MM-DDTHH:mm:ssZ'
const prepareResult = (dataset, result, aliases, aggResults, timezone = 'UTC') => {
  for (const prop of dataset.schema) {
    if (prop.type === 'string' && prop.format === 'date-time') {
      if (typeof result[prop.key] === 'string') {
        result[prop.key] = dayjs(result[prop.key]).tz(timezone).format(isoWithOffset)
      }
      if (Array.isArray(result[prop.key])) {
        result[prop.key] = result[prop.key].map(d => dayjs(d).tz(timezone).format(isoWithOffset))
      }
    }
  }
  if (aggResults) {
    for (const key of Object.keys(aggResults)) {
      if (!key.startsWith('___order_by_')) result[key] = aggResults[key].value
    }
  }
  for (const key of Object.keys(aliases)) {
    for (const alias of aliases[key]) {
      result[alias] = result[key]
    }
    delete result[key]
  }
}

const getRecords = (version: '2.0' | '2.1') => async (req, res, next) => {
  (res as any).throttleEnd()

  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const esQuery: any = { track_total_hits: true }
  esQuery.size = (query.limit ?? query.rows) ? Number(query.limit ?? query.rows) : 100
  if (esQuery.size < 0) esQuery.size = 100 // -1 is interpreted as 100
  if (query.offset) esQuery.from = Number(query.offset)

  const fields = dataset.schema.map(f => f.key)
  let aliases: Record<string, string[]> = {}
  let selectAggs = {}
  if (query.select) {
    const select = parseSelect(query.select, { dataset })
    esQuery._source = select.sources
    aliases = select.aliases
    esQuery.aggs = selectAggs = select.aggregations
  } else {
    esQuery._source = fields.filter(key => !key.startsWith('_'))
  }

  if (query.order_by) {
    const orderBy = parseOrderBy(query.order_by, { dataset, selectAggs: esQuery.aggs })
    esQuery.aggs = { ...esQuery.aggs, ...orderBy.aggregations }
    esQuery.sort = orderBy.sort
  } else {
    esQuery.sort = []
  }

  esQuery.query = parseFilters(dataset, query, 'records')

  const groupBy: string[] = query.group_by?.split(',')
  if (groupBy?.length) {
    for (const groupByKey of groupBy) {
      const prop = dataset.schema.find(p => p.key === groupByKey)
      if (!prop) {
        compatReqCounter.inc({ endpoint: 'records', status: 'invalid-group-by' })
        throw httpError(400, `Impossible de grouper par le champ ${groupByKey}, il n'existe pas dans le jeu de données ou alors il correspond à une capacité d'aggrégation non supportée par cette couche de compatibilité pour la version d'API précédente.`)
      }
      if (prop['x-capabilities'] && prop['x-capabilities'].values === false) {
        throw httpError(400, `Impossible de grouper sur le champ ${groupByKey}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
      }
    }
    const bucketSort = {
      bucket_sort: {
        sort: esQuery.sort,
        size: esQuery.size,
        from: esQuery.from
      }
    }
    const subAggs = esQuery.aggs
    if (groupBy.length > 1) {
      esQuery.aggs = {
        group_by: {
          multi_terms: {
            terms: groupBy.map(field => ({ field }))
          },
          aggs: {
            ...subAggs,
            sort: bucketSort,
          }
        }
      }
    } else {
      esQuery.aggs = {
        group_by: {
          terms: { field: groupBy[0] },
          aggs: {
            ...subAggs,
            sort: bucketSort
          }
        }
      }
    }
    esQuery.size = 0
    delete esQuery.from
    delete esQuery._source
    delete esQuery.sort
  } else {
    completeSort(dataset, esQuery.sort, query)
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
        for (const aggKey of Object.keys(selectAggs)) {
          item[aggKey] = bucket[aggKey].value
        }
        result.results.push(item)
      }
    } else {
      for (const bucket of buckets) {
        const item: any = {}
        item[groupBy[0]] = bucket.key
        for (const aggKey of Object.keys(selectAggs)) {
          item[aggKey] = bucket[aggKey].value
        }
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
      const line = flatten(esResponse.hits.hits[i]._source)
      prepareResult(dataset, line, aliases, esResponse.aggregations, req.query.timezone)
      result.results.push(line)
    }
    compatReqCounter.inc({ endpoint: 'records', status: 'ok' })
    res.send(result)
  }
}

async function * iterHits (es, dataset, esQuery, aliases, totalSize = 50000, timezone = 'utc') {
  const flatten = getFlatten(dataset, false, esQuery._source)

  let chunkSize = 1000
  if (totalSize !== -1 && totalSize < chunkSize) chunkSize = totalSize
  let remaining = totalSize
  while (true) {
    let size = chunkSize
    if (totalSize !== -1 && remaining < chunkSize) size = remaining
    const esResponse = (await es.search({
      index: esUtils.aliasName(dataset),
      body: { ...esQuery, size },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    }))
    const hits = esResponse.hits.hits
    const lines = []
    for (const hit of hits) {
      const line = flatten(hit._source)
      prepareResult(dataset, line, aliases, esResponse.aggregations, timezone)
      lines.push(line)
    }
    yield lines
    if (hits.length < chunkSize) break
    if (totalSize !== -1) {
      remaining -= hits.length
      if (remaining <= 0) break
    }
    esQuery.search_after = hits[hits.length - 1].sort
  }
}

const exports = (version: '2.0' | '2.1') => async (req, res, next) => {
  res.setHeader('X-Accel-Buffering', 'no')
  const esClient = req.app.get('es') as any
  const dataset: DatasetInternal = (req as any).dataset
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!dataset.schema) throw httpError(404, 'dataset without data')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const esQuery: any = {}

  const fields = dataset.schema.map(f => f.key)
  let aliases: Record<string, string[]> = {}
  if (query.select) {
    const select = parseSelect(query.select, { dataset })
    esQuery._source = select.sources
    aliases = select.aliases
    esQuery.aggs = select.aggregations
  } else {
    esQuery._source = fields.filter(key => !key.startsWith('_'))
  }
  if (req.params.format === 'geojson') {
    const geoshapeProp = req.dataset.schema.find(p => p.key === '_geoshape')
    if (!esQuery._source.includes('_geoshape') && geoshapeProp) {
      esQuery._source.push('_geoshape')
    }
    if (!esQuery._source.includes('_geopoint')) esQuery._source.push('_geopoint')
  }
  if (query.order_by) {
    const orderBy = parseOrderBy(query.order_by, { dataset, selectAggs: esQuery.aggs })
    esQuery.aggs = { ...esQuery.aggs, ...orderBy.aggregations }
    completeSort(dataset, orderBy.sort, query)
    esQuery.sort = orderBy.sort
  } else {
    esQuery.sort = []
  }
  esQuery.query = parseFilters(dataset, query, 'exports')
  const useLabels = query.use_labels === 'true'
  let transformStreams: Stream[] = []

  // full potential list:
  // "csv" "fgb" "geojson" "gpx" "json" "jsonl" "jsonld" "kml" "n3" "ov2" "parquet" "rdfxml" "shp" "turtle" "xlsx"

  if (req.params.format === 'csv') {
    // https://help.opendatasoft.com/apis/ods-explore-v2/#tag/Dataset/operation/exportRecordsCSV
    // res.setHeader('content-type', 'text/csv')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.csv'))
    const options: CsvOptions = csvStringifyOptions(dataset, query, useLabels)
    if (version === '2.0') options.bom = req.query.with_bom === 'true'
    else options.bom = req.query.with_bom !== 'false'
    options.delimiter = req.query.delimiter ?? ';'
    options.quoted_string = req.query.quote_all === 'true'
    transformStreams = [csvStrStream(options)]
  } else if (req.params.format === 'xlsx') {
    // res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.xlsx'))
    const { default: Excel } = await import('exceljs')
    const workbookWriter = new Excel.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: true
    })
    const worksheet = workbookWriter.addWorksheet('Feuille 1')
    // Define columns (optional)
    const properties = esQuery._source.map(key => dataset.schema.find(prop => prop.key === key))
    worksheet.columns = properties.map(p => ({
      key: p.key,
      header: (useLabels ? p.title : p['x-originalName']) || p['x-originalName'] || p.key
    }))
    const iter = iterHits(esClient, dataset, esQuery, aliases, query.limit ? Number(query.limit) : -1, query.timezone)
    for await (const items of iter) {
      for (const item of items) {
        worksheet.addRow(item)
      }
      // Commit all pending changes
      worksheet.commit()
    }
    await workbookWriter.commit()

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
    // const parquet = await import('@dsnp/parquetjs')
    // TODO: should we flatten or nest multi-valued values ?
    // const schema = jsonSchema(dataset.schema, req.publicBaseUrl, false)
    // const parquetSchema = parquet.ParquetSchema.fromJsonSchema(schema)
    // transformStreams = [new parquet.ParquetTransformer(parquetSchema)]
    const { ParquetWriterStream } = await import('../../../../parquet-writer/parquet-writer-stream.mts')
    const basicSchema = esQuery._source.map((key: string) => {
      const prop = dataset.schema!.find(p => p.key === key)!
      return { key: prop.key, type: prop.type, format: prop.format, required: prop['x-required'] }
    })
    transformStreams = [new ParquetWriterStream(basicSchema)]
  } else if (req.params.format === 'json') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.json'))
    // TODO: should we flatten or nest multi-valued values ?
    transformStreams = [JSONStream.stringify('[', ',', ']')]
  } else if (req.params.format === 'jsonl') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.jsonl'))
    // TODO: should we flatten or nest multi-valued values ?
    transformStreams = [
      new Transform({
        objectMode: true,
        transform (item, encoding, callback) {
          callback(null, JSON.stringify(encoding) + '\n')
        }
      })
    ]
  } else if (req.params.format === 'geojson') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.geojson'))
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
    compatReqCounter.inc({ endpoint: 'exports', status: 'unsupported' })
    throw httpError(400, `le format "${req.params.format}" n'est pas supporté par l'export de données de cette couche de compatibilité pour la version d'API précédente.`)
  }
  try {
    await pump(
      Readable.from(iterHits(esClient, dataset, esQuery, aliases, query.limit ? Number(query.limit) : -1, query.timezone)),
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
    console.warn('Error during streamed ods compat export', status, message, err)
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
  getRecords('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.0')
)
router.get(
  '/v2.1/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.0')
)

// also expose the same endpoint on the datasets router to expose in the api doc
datasetsRouter.get(
  '/:datasetId/compat-ods/records',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.1')
)
datasetsRouter.get(
  '/:datasetId/compat-ods/exports/:format',
  readDataset({ fillDescendants: true }),
  datasetsApiKeyMiddleware,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  exports('2.1')
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ endpoint: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
