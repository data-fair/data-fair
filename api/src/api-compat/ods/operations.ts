// Pure ODS → Elasticsearch query translation and result shaping for the ODS API
// compatibility layer. No I/O (no mongo/ES/req): the unit-test surface for the layer.
// index.ts keeps routing, the ES search calls, streaming and response sending.
// import getFilterableFields from the config-free es/operations.ts (NOT the es/index.ts barrel, which
// loads #config) so this module stays config-free and unit-testable. See code-conventions.md §2.
import { getFilterableFields, resolveExactKeywordTarget, virtualFilterClauses, descendantsFilterClause } from '../../datasets/es/operations.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Counter } from 'prom-client'
import { parse as parseWhere } from './where.peg.js'
import { parse as parseSelect } from './select.peg.js'
import { parse as parseOrderBy } from './order-by.peg.js'
import { parse as parseGroupBy } from './group-by.peg.js'
import { parse as parseAliases } from './aliases.peg.js'
import { parse as parseRefine } from './refine.peg.js'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'

dayjs.extend(timezone)
dayjs.extend(utc)

export type Aliases = Record<string, { name: string, numberInterval?: number, dateInterval?: { value: number, unit: string }, numberRanges?: boolean }[]>
export type TransformType = 'date_part' | 'date_transform'
export type Transforms = Record<string, { type: TransformType, param?: any, ignoreTimezone?: boolean }>

export const compatReqCounter = new Counter({
  name: 'df_compat_ods_req',
  help: 'A counter of the usage of the ods compatibility layer.',
  labelNames: ['route', 'status']
})

export const logCompatODSError = (err: any, value: string, route: string, status: string, datasetId: string) => {
  console.warn(`[compat-ods][${status}][${datasetId}][${value}]`, err.message ?? err)
  compatReqCounter.inc({ route, status })
}

export const completeSort = (dataset, sort, query) => {
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

export const parseFilters = (dataset, query, route) => {
  const filter: any[] = []
  const must: any[] = []
  const mustNot: any[] = []

  // Enforced static filters from virtual datasets
  if (dataset.virtual && dataset.virtual.filters) {
    filter.push(...virtualFilterClauses(dataset.virtual.filters))
  }
  // Scoped filters inherited from intermediate virtual children, read from the same
  // dataset.descendants that drives the multi-index target (see utils/virtual.ts).
  // null = no descendant carries filters, nothing to add. Every route reaching this builder
  // (api-compat/ods/index.ts) goes through readDataset({ fillDescendants: true }), so descendants
  // are always resolved; if a future route ever reached here without that middleware,
  // descendantsFilterClause fails loudly instead of silently leaking rows a child's
  // `virtual.filters` is meant to hide.
  if (dataset.isVirtual) {
    const descendantsClause = descendantsFilterClause(dataset.descendants)
    if (descendantsClause) filter.push(descendantsClause)
  }

  // Envorced filter in case of rest datasets with line ownership
  if (query.owner) {
    filter.push({ term: { _owner: query.owner } })
  }

  if (query.where) {
    const { searchFields, wildcardFields } = getFilterableFields(dataset)
    try {
      must.push(parseWhere(query.where, { searchFields, wildcardFields, dataset, timezone: query.timezone, resolveExactKeywordTarget }))
    } catch (err: any) {
      logCompatODSError(err, query.where, route, 'invalid-where', dataset.id)
      throw httpError(400, 'le paramètre "where" est invalide : ' + err.message)
    }
  }

  if (query.refine) {
    try {
      const refineArray = Array.isArray(query.refine) ? query.refine : [query.refine]
      for (const refine of refineArray) {
        const refineFilters = parseRefine(refine, { dataset, timezone: query.timezone })
        for (const f of refineFilters) {
          filter.push(f)
        }
      }
    } catch (err: any) {
      logCompatODSError(err, query.refine, route, 'invalid-refine', dataset.id)
      throw httpError(400, 'le paramètre "refine" est invalide : ' + err.message)
    }
  }

  return { bool: { filter, must, must_not: mustNot } }
}

// Per-row date formatting (called for every date-time field of every row in prepareResult) used to
// go through dayjs.tz(date, timezone).format(...). dayjs already caches its Intl.DateTimeFormat, but
// its instance .tz() still runs Date#toLocaleString + a re-parse + object allocation per call, which
// dominated CPU on large ODS records/exports pulls and blocked the event loop. A cached
// Intl.DateTimeFormat + a single formatToParts is byte-identical to the dayjs output and ~18x cheaper.
const dtfCache = new Map<string, Intl.DateTimeFormat>()
const getDtf = (timezone: string) => {
  let dtf = dtfCache.get(timezone)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset'
    })
    dtfCache.set(timezone, dtf)
  }
  return dtf
}
const pad = (value: string | number, len = 2) => String(value).padStart(len, '0')
// "GMT+05:30" / "GMT-04:00" / "GMT" -> "+05:30" / "-04:00" / "+00:00"
const parseOffset = (timeZoneName: string) => {
  if (timeZoneName === 'GMT' || timeZoneName === 'UTC') return '+00:00'
  const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(timeZoneName)
  return m ? `${m[1]}${pad(m[2])}:${m[3] || '00'}` : '+00:00'
}

export const isoWithOffset = (dateValue, timezone, alwaysFormat = false) => {
  const date = new Date(dateValue)
  if (!timezone || timezone.toLowerCase() === 'utc') {
    return alwaysFormat ? date.toISOString().slice(0, 19) + '+00:00' : date.toISOString()
  }
  let year = ''
  let month = ''
  let day = ''
  let hour = ''
  let minute = ''
  let second = ''
  let offset = '+00:00'
  for (const part of getDtf(timezone).formatToParts(date)) {
    switch (part.type) {
      case 'year': year = part.value; break
      case 'month': month = part.value; break
      case 'day': day = part.value; break
      case 'hour': hour = part.value; break
      case 'minute': minute = part.value; break
      case 'second': second = part.value; break
      case 'timeZoneName': offset = parseOffset(part.value); break
    }
  }
  return `${pad(year, 4)}-${month}-${day}T${hour}:${minute}:${second}${offset}`
}

export const prepareResult = (dataset, result, aggResults, timezone = 'UTC') => {
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

export const transforms: Record<TransformType, (value: any, timezone?: string, extra?: string) => any> = {
  date_part: (dateStr, timezone, part) => {
    if (timezone && timezone.toLowerCase() !== 'utc') {
      // reuse the cached Intl formatter instead of the per-call dayjs.tz(); its parts are already
      // the calendar values in the timezone (month is 1-based, matching dayjs's .month() + 1)
      for (const p of getDtf(timezone).formatToParts(new Date(dateStr))) {
        if (p.type === part) return parseInt(p.value, 10)
      }
      return dateStr
    }
    const date = dayjs(dateStr)
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
  },
  // dayjs format does not match odsql
  // https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-functions/date_format()
  // https://day.js.org/docs/en/display/format
  // date_format() used to run dayjs(dateStr).tz() per value — the same per-value Intl cost isoWithOffset
  // had (see the comment above getDtf). Resolve the instant's offset via the cached Intl formatter
  // instead, then format from a fixed offset: identical output, ~10x cheaper. The odsql→dayjs format
  // rewrite (two regexes) is also memoized — it ran per value on a per-query constant.
  date_transform: (dateStr, timezone, format) => {
    const dayjsFormat = odsFormat2dayjs(format)
    const tz = timezone ?? 'utc'
    // offset/abbreviation tokens (Z, z) need a tz-plugin instance (and both dayjs.tz and dayjs.utcOffset
    // route offset math through host-local Dates): keep the historical dayjs.tz path for those formats,
    // including the undefined default format (which ends with Z)
    if (dayjsFormat === undefined || /[zZ]/.test(dayjsFormat.replace(/\[[^\]]*\]/g, ''))) {
      return dayjs(dateStr).tz(tz).format(dayjsFormat)
    }
    if (tz.toLowerCase() === 'utc') return dayjs.utc(dateStr).format(dayjsFormat)
    // offset-free format: shift the instant by the tz offset (resolved via the cached Intl formatter,
    // like isoWithOffset above) and render the UTC wall clock — identical output, ~10x cheaper, and
    // host-timezone independent (pure ms arithmetic, no local-Date round trip)
    const date = new Date(dateStr)
    return dayjs.utc(date.getTime() + tzOffsetMinutes(date, tz) * 60000).format(dayjsFormat)
  }
}

const dayjsFormatCache = new Map<string, string>()
const odsFormat2dayjs = (format?: string) => {
  if (format === undefined) return undefined
  let f = dayjsFormatCache.get(format)
  if (f === undefined) {
    f = format.replace(/yy/g, 'YY').replace(/d/g, 'D')
    dayjsFormatCache.set(format, f)
  }
  return f
}

// offset in minutes of an instant in a timezone, from the same cached Intl formatter isoWithOffset uses
const tzOffsetMinutes = (date: Date, timezone: string) => {
  let offset = '+00:00'
  for (const part of getDtf(timezone).formatToParts(date)) {
    if (part.type === 'timeZoneName') { offset = parseOffset(part.value); break }
  }
  return (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))
}

export const applyAliases = (result: any, aliases: Aliases, selectTransforms: Transforms, timezone?: string) => {
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

export const sortBuckets = (buckets: any[], sort: any[]) => {
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

export const prepareBucketResult = (dataset, bucket, selectAggs, composite) => {
  const result = composite ? { ...bucket.key } : { key: bucket.key }
  if (bucket.from_as_string || bucket.to_as_string) {
    result.key = `[${bucket.from_as_string ? new Date(bucket.from_as_string).toISOString() : '*'}, ${bucket.to_as_string ? new Date(bucket.to_as_string).toISOString() : '*'}[`
  }
  for (const aggKey of Object.keys(selectAggs)) {
    result[aggKey] = bucket[aggKey].value ?? bucket[aggKey].values?.[0]?.value
  }
  return result
}

export const prepareEsQuery = (dataset: any, query: Record<string, string>, route: string) => {
  const grouped = !!query.group_by

  const esQuery: any = {}
  esQuery.size = (query.limit ?? query.rows) ? Number(query.limit ?? query.rows) : 10
  if (esQuery.size < 0) esQuery.size = 100 // -1 is interpreted as 100

  const size = esQuery.size
  const from = esQuery.from = query.offset ? Number(query.offset) : 0

  const fields = dataset.schema.map(f => f.key)

  const aliasesSources = [query.select, query.group_by].filter(Boolean).filter(p => p.trim() !== '*')
  const simpleAliases: Aliases = aliasesSources.length ? parseAliases(aliasesSources.join(',')) : {}

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
      logCompatODSError(err, query.select, route, 'invalid-select', dataset.id)
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
    let orderBy
    try {
      orderBy = parseOrderBy(query.order_by, { dataset, aliases, simpleAliases, grouped })
    } catch (err: any) {
      logCompatODSError(err, query.order_by, route, 'invalid-order-by', dataset.id)
      throw httpError(400, 'le paramètre "order_by" est invalide : ' + err.message)
    }
    esQuery.aggs = { ...esQuery.aggs, ...orderBy.aggregations }
    esQuery.sort = sort = orderBy.sort
  } else {
    esQuery.sort = []
  }

  esQuery.query = parseFilters(dataset, query, route)

  if (grouped) {
    let groupBy
    try {
      groupBy = parseGroupBy(query.group_by, { dataset, aggs: esQuery.aggs, sort: esQuery.sort, aliases, transforms: selectTransforms, timezone: query.timezone })
    } catch (err: any) {
      logCompatODSError(err, query.group_by, route, 'invalid-group-by', dataset.id)
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
