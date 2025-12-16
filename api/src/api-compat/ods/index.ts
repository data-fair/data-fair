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
import datasetsRouter, { apiKeyMiddlewareRead } from '../../datasets/router.js'
import { parse as parseWhere } from './where.peg.js'
import { parse as parseSelect } from './select.peg.js'
import { parse as parseOrderBy } from './order-by.peg.js'
import { parse as parseGroupBy } from './group-by.peg.js'
import mongo from '#mongo'
import memoize from 'memoizee'
import pump from '../../misc/utils/pipe.ts'
import { stringify as csvStrStream, type Options as CsvOptions } from 'csv-stringify'
import contentDisposition from 'content-disposition'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import JSONStream from 'JSONStream'
import type { DatasetInternal } from '#types'

dayjs.extend(timezone)
dayjs.extend(utc)

type Aliases = Record<string, { name: string, numberInterval?: number, dateInterval?: { value: number, unit: string }, numberRanges?: boolean }[]>
type TransformType = 'date_part'
type Transforms = Record<string, { type: TransformType, param?: any, ignoreTimezone?: boolean }>

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
      must.push(parseWhere(query.where, { searchFields, wildcardFields, dataset, timezone: query.timezone }))
    } catch (err: any) {
      logCompatODSError(err, query.where, endpoint, 'invalid-where')
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

const isoWithOffset = (dateValue, timezone, alwaysFormat = false) => {
  const date = new Date(dateValue)
  if (!alwaysFormat && (!timezone || timezone.toLowerCase() === 'utc')) return date.toISOString()
  return dayjs.tz(date, timezone).format('YYYY-MM-DDTHH:mm:ssZ')
}

const prepareResult = (dataset, result, aggResults, timezone = 'UTC') => {
  for (const prop of dataset.schema) {
    if (prop.type === 'string' && prop.format === 'date-time') {
      if (typeof result[prop.key] === 'string') {
        result[prop.key] = isoWithOffset(result[prop.key], timezone, true)
      }
      if (Array.isArray(result[prop.key])) {
        result[prop.key] = result[prop.key].map(d => isoWithOffset(d, timezone, true))
      }
    }
  }
  if (aggResults) {
    for (const key of Object.keys(aggResults)) {
      if (!key.startsWith('___order_by_')) result[key] = aggResults[key].value
    }
  }
}

const transforms: Record<TransformType, (value: any, timezone?: string, extra?: string) => any> = {
  date_part: (dateStr, timezone, part) => {
    const date = timezone && timezone?.toLocaleLowerCase() !== 'utc' ? dayjs(dateStr).tz(timezone) : dayjs(dateStr)
    switch (part) {
      case 'year':
        return date.year()
      case 'month':
        return date.month() + 1
      case 'day':
        return date.date()
      case 'hour':
        return date.hour()
      case 'minute':
        return date.minute()
      case 'second':
        return date.second()
    }
    return dateStr
  }
  /* dayjs format does not match odsql https://day.js.org/docs/en/display/format#list-of-all-available-formats
  date_format: (dateStr, timezone, format) => {
    return dayjs(dateStr).tz(timezone ?? 'utc').format(format?.replace(/yy/g, 'YY'))
  } */
}

const applyAliases = (result: any, aliases: Aliases, selectTransforms: Transforms, timezone?: string) => {
  for (const key of Object.keys(aliases)) {
    let shouldDelete = true
    for (const alias of aliases[key]) {
      if (alias.name === key) shouldDelete = false
      let value = result[key]
      if (alias.numberInterval !== undefined) {
        value = `[${value}, ${value + alias.numberInterval}[`
      }
      if (alias.numberRanges) {
        const parts = value.split('-')
        value = `[${parts[0]}, ${parts[1]}[`
      }
      if (alias.dateInterval !== undefined) {
        const date = new Date(value)
        value = `[${isoWithOffset(date, timezone)}, ${isoWithOffset(dayjs(date).add(alias.dateInterval.value, alias.dateInterval.unit as dayjs.ManipulateType), timezone)}[`
      }
      result[alias.name] = value
    }
    if (shouldDelete) delete result[key]
  }
  for (const [key, transform] of Object.entries(selectTransforms)) {
    if (result[key] !== undefined && result[key] !== null) {
      result[key] = transforms[transform.type](result[key], transform.ignoreTimezone ? undefined : timezone, transform.param)
    }
  }
}

const sortBuckets = (buckets: any[], sort: any[]) => {
  if (!sort.length) return buckets
  const sortTuples = sort.map(s => Object.entries(s)[0])
  const comparator = (r1, r2) => {
    for (const [key, direction] of sortTuples) {
      const v1 = r1[key]?.value ?? r1[key] ?? r1.key[key]
      const v2 = r2[key]?.value ?? r2[key] ?? r2.key[key]
      if (v1 === v2) continue
      if (v1 > v2) return direction === 'asc' ? 1 : -1
      else return direction === 'asc' ? -1 : 1
    }
    return 0
  }
  return buckets.sort(comparator)
}

const prepareBucketResult = (dataset, bucket, selectAggs, composite) => {
  const result = composite ? { ...bucket.key } : { key: bucket.key }
  if (bucket.from_as_string || bucket.to_as_string) {
    result.key = `[${bucket.from_as_string ? new Date(bucket.from_as_string).toISOString() : '*'}, ${bucket.to_as_string ? new Date(bucket.to_as_string).toISOString() : '*'}[`
  }
  for (const aggKey of Object.keys(selectAggs)) {
    result[aggKey] = bucket[aggKey].value ?? bucket[aggKey].values?.[0]?.value
  }
  return result
}

const logCompatODSError = (err: any, value: string, endpoint: string, status: string) => {
  console.warn(`[compat-ods][${status}][${value}]`, err.message ?? err)
  compatReqCounter.inc({ endpoint, status })
}

const prepareEsQuery = (dataset: any, query: Record<string, string>, endpoint: string) => {
  const grouped = !!query.group_by

  const esQuery: any = {}
  esQuery.size = (query.limit ?? query.rows) ? Number(query.limit ?? query.rows) : 10
  if (esQuery.size < 0) esQuery.size = 100 // -1 is interpreted as 100

  const size = esQuery.size
  const from = esQuery.from = query.offset ? Number(query.offset) : 0

  const fields = dataset.schema.map(f => f.key)

  let aliases: Aliases = {}
  let selectAggs = {}
  let selectSource = []
  let selectFinalKeys = []
  let selectTransforms: Record<string, string> = {}
  let sort = []
  let composite = false
  if (query.select && query.select.trim() !== '*') {
    let select
    try {
      select = parseSelect(query.select, { dataset, grouped })
    } catch (err: any) {
      logCompatODSError(err, query.select, endpoint, 'invalid-select')
      throw httpError(400, 'le paramètre "select" est invalide : ' + err.message)
    }
    selectSource = esQuery._source = select.sources
    selectFinalKeys = select.finalKeys
    selectTransforms = select.transforms
    if (esQuery._source.length === 0) esQuery._source = ['_id']
    aliases = select.aliases
    esQuery.aggs = selectAggs = select.aggregations
  } else {
    selectSource = esQuery._source = fields.filter(key => !key.startsWith('_'))
    selectFinalKeys = selectSource
  }

  if (query.order_by) {
    let orderBy = parseOrderBy(query.order_by, { dataset, aliases, grouped })
    try {
      orderBy = parseOrderBy(query.order_by, { dataset, aliases, grouped })
    } catch (err: any) {
      logCompatODSError(err, query.order_by, endpoint, 'invalid-order-by')
      throw httpError(400, 'le paramètre "order_by" est invalide : ' + err.message)
    }
    esQuery.aggs = { ...esQuery.aggs, ...orderBy.aggregations }
    esQuery.sort = sort = orderBy.sort
  } else {
    esQuery.sort = []
  }

  esQuery.query = parseFilters(dataset, query, endpoint)

  if (grouped) {
    let groupBy
    try {
      groupBy = parseGroupBy(query.group_by, { dataset, aggs: esQuery.aggs, sort: esQuery.sort, aliases, transforms: selectTransforms, timezone: query.timezone })
    } catch (err: any) {
      logCompatODSError(err, query.group_by, endpoint, 'invalid-group-by')
      throw httpError(400, 'le paramètre "group_by" est invalide : ' + err.message)
    }
    esQuery.aggs = { ___group_by: groupBy.agg }
    esQuery.size = 0
    delete esQuery.from
    delete esQuery._source
    delete esQuery.sort
    composite = groupBy.composite
  } else {
    completeSort(dataset, esQuery.sort, query)
    esQuery.track_total_hits = true
  }

  return { grouped, size, from, esQuery, selectAggs, selectSource, selectFinalKeys, selectTransforms, aliases, sort, composite }
}

const getRecords = (version: '2.0' | '2.1') => async (req, res, next) => {
  (res as any).throttleEnd()

  const esClient = req.app.get('es') as any
  const dataset = (req as any).dataset
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

  let esResponse: any
  try {
    esResponse = await esClient.search({
      index: esUtils.aliasName(dataset),
      body: esQuery,
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })
  } catch (err) {
    const { message, status } = esUtils.extractError(err)
    logCompatODSError(message, req.url, 'records', 'es-error')
    throw httpError(status, message)
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
    res.send({ total_count: buckets.length, results })
  } else {
    const result = { total_count: esResponse.hits.total.value, results: [] as any[] }
    const flatten = getFlatten(dataset, false, selectSource)
    for (let i = 0; i < esResponse.hits.hits.length; i++) {
      // avoid blocking the event loop
      if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
      const line = flatten(esResponse.hits.hits[i]._source)
      prepareResult(dataset, line, esResponse.aggregations, req.query.timezone)
      applyAliases(line, aliases, selectTransforms, query.timezone)
      result.results.push(line)
    }
    compatReqCounter.inc({ endpoint: 'records', status: 'ok' })
    res.send(result)
  }
}

const maxChunkSize = 1000

async function * iterHits (es, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, totalSize, grouped, composite, timezone = 'utc') {
  const flatten = getFlatten(dataset, false, selectSource)

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
    }))

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
  const dataset: DatasetInternal = (req as any).dataset
  const query = req.query

  if (!config.compatODS) throw httpError(404, 'unknown API')
  if (!dataset.schema) throw httpError(404, 'dataset without data')
  if (!(await getCompatODS(dataset.owner.type, dataset.owner.id))) throw httpError(404, 'unknown API')

  const { grouped, from, esQuery, selectAggs, selectSource, selectFinalKeys, selectTransforms, aliases, composite } = prepareEsQuery(dataset, query, 'exports')

  if (from) throw httpError(400, 'offset parameter is not supported for exports')

  if (req.params.format === 'geojson') {
    const geoshapeProp = req.dataset.schema.find(p => p.key === '_geoshape')
    if (!esQuery._source.includes('_geoshape') && geoshapeProp) {
      esQuery._source.push('_geoshape')
    }
    if (!esQuery._source.includes('_geopoint')) esQuery._source.push('_geopoint')
  }

  const useLabels = query.use_labels === 'true'
  let transformStreams: Stream[] = []

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
  } else if (req.params.format === 'xlsx') {
    // res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.type('xlsx')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.xlsx'))
    const { default: Excel } = await import('exceljs')
    const workbookWriter = new Excel.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: true
    })
    const worksheet = workbookWriter.addWorksheet('Feuille 1')
    // Define columns (optional)
    worksheet.columns = columns
    const iter = iterHits(esClient, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, query.limit ? Number(query.limit) : -1, grouped, composite, query.timezone)
    for await (const items of iter) {
      for (const item of items) {
        worksheet.addRow(item).commit()
      }
    }
    worksheet.commit()
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
    compatReqCounter.inc({ endpoint: 'exports', status: 'unsupported' })
    throw httpError(400, `le format "${req.params.format}" n'est pas supporté par l'export de données de cette couche de compatibilité pour la version d'API précédente.`)
  }
  try {
    await pump(
      Readable.from(iterHits(esClient, dataset, esQuery, aliases, selectSource, selectAggs, selectTransforms, query.limit ? Number(query.limit) : -1, grouped, composite, query.timezone)),
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
    const { message, status } = esUtils.extractError(err)
    logCompatODSError(err, req.url, 'exports', 'stream-error')
    throw httpError(status, message)
  }
}

// mimic ods api pattern to capture all deprecated traffic
router.get(
  '/v2.1/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.0')
)
router.get(
  '/v2.1/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.1')
)
router.get(
  '/v2.0/catalog/datasets/:datasetId/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.noCache,
  exports('2.0')
)

// also expose the same endpoint on the datasets router to expose in the api doc
datasetsRouter.get(
  '/:datasetId/compat-ods/records',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSRecords', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  getRecords('2.1')
)
datasetsRouter.get(
  '/:datasetId/compat-ods/exports/:format',
  readDataset({ fillDescendants: true }),
  apiKeyMiddlewareRead,
  permissions.middleware('readCompatODSExports', 'read', 'readDataAPI'),
  cacheHeaders.resourceBased('finalizedAt'),
  exports('2.1')
)

router.use('/', (req, res, next) => {
  compatReqCounter.inc({ endpoint: 'unknown', status: 'unsupported' })
  throw httpError(410, 'Cette couche de compatibilité pour la version d\'API précédente ne supporte pas cette requête.')
})

export default router
