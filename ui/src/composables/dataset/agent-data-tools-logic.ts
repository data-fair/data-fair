import { toCsv, cleanRow } from '../agent/utils-logic.js'

export function applyGeoParams (query: Record<string, string>, bbox?: string, geoDistance?: string) {
  if (bbox) query.bbox = bbox
  if (geoDistance) query.geo_distance = geoDistance
}

export function applyDateMatchParam (query: Record<string, string>, dateMatch?: string) {
  if (dateMatch) query.date_match = dateMatch
}

/**
 * Drop incomplete _geo_distance sort entries (without :lon:lat suffix).
 * LLMs sometimes write sort: "_geo_distance" redundantly when a geoDistance filter is already present.
 * The API already auto-sorts by distance when a geo_distance filter is set.
 */
export function normalizeSort (sort: string): string {
  return sort.split(',').map(part => {
    const trimmed = part.trim()
    if (/^-?_geo_distance$/.test(trimmed)) return null
    return trimmed
  }).filter(Boolean).join(',')
}

type FetchFn = <T = any>(url: string, opts?: any) => Promise<T>

export async function executeGetDatasetSchema (params: { datasetId: string }, fetchFn: FetchFn) {
  const [dataset, linesData] = await Promise.all([
    fetchFn<any>(`datasets/${encodeURIComponent(params.datasetId)}`, { query: { select: 'schema,title' } }),
    fetchFn<any>(`datasets/${encodeURIComponent(params.datasetId)}/lines`, { query: { size: '3' } })
  ])

  const schema = dataset.schema
    ?.filter((col: any) => !['_i', '_id', '_rand'].includes(col.key))
    .map((col: any) => {
      const notes: string[] = []
      if (col.description) notes.push(col.description)
      if (col['x-concept']?.title) notes.push(`concept: ${col['x-concept'].title}`)
      if (col.enum) {
        const shown = col.enum.slice(0, 20).join(', ')
        notes.push(col.enum.length > 20 ? `enum: ${shown}… (${col.enum.length} total)` : `enum: ${shown}`)
      }
      if (col['x-labels']) {
        const entries = Object.entries(col['x-labels'])
        const shown = entries.slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', ')
        notes.push(entries.length > 10 ? `labels: ${shown}… (${entries.length} total)` : `labels: ${shown}`)
      }
      return `| \`${col.key}\` | ${col.type} | ${col.title || ''} | ${notes.join(' — ')} |`
    })

  const samples = (linesData.results ?? []).map(cleanRow)

  const sections = [
    `# Schema: ${dataset.title}`,
    '| Key | Type | Title | Notes |',
    '|-----|------|-------|-------|',
    ...(schema || []),
    '',
    '## Sample data',
    toCsv(samples)
  ]
  return sections.join('\n')
}

export interface SearchDataParams {
  datasetId: string
  q?: string
  filters?: Record<string, string>
  select?: string
  sort?: string
  size?: number
  page?: number
  bbox?: string
  geoDistance?: string
  dateMatch?: string
  next?: string
}

export async function executeSearchData (params: SearchDataParams, fetchFn: FetchFn) {
  let data: any

  if (params.next) {
    data = await fetchFn<any>(params.next)
  } else {
    const size = Math.min(Math.max(params.size || 10, 1), 50)
    const query: Record<string, string> = { size: String(size) }
    if (params.q) { query.q = params.q; query.q_mode = 'complete' }
    if (params.select) query.select = params.select
    if (params.sort) {
      const normalized = normalizeSort(params.sort)
      if (normalized) query.sort = normalized
    }
    if (params.page) query.page = String(params.page)
    if (params.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        query[key] = String(value)
      }
    }
    applyGeoParams(query, params.bbox, params.geoDistance)
    applyDateMatchParam(query, params.dateMatch)

    data = await fetchFn<any>(`datasets/${encodeURIComponent(params.datasetId)}/lines`, { query })
  }

  const rows = (data.results ?? []).map(cleanRow)

  const lines = [
    `**${data.total}** rows found (showing ${rows.length}, page ${params.page || 1})`,
    '',
    toCsv(rows)
  ]
  if (data.next) {
    lines.push('', 'Next page available.')
  }
  return lines.join('\n')
}

export interface AggregateDataParams {
  datasetId: string
  groupByColumns: string[]
  metric?: { column?: string, type?: string }
  filters?: Record<string, string>
  bbox?: string
  geoDistance?: string
  dateMatch?: string
  sort?: string
}

export async function executeAggregateData (params: AggregateDataParams, fetchFn: FetchFn) {
  const query: Record<string, string> = {
    field: params.groupByColumns.join(';')
  }
  if (params.metric && params.metric.type !== 'count') {
    query.metric = params.metric.type!
    query.metric_field = params.metric.column!
  }
  if (params.sort) query.sort = params.sort
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      query[key] = String(value)
    }
  }
  applyGeoParams(query, params.bbox, params.geoDistance)
  applyDateMatchParam(query, params.dateMatch)

  const data = await fetchFn<any>(`datasets/${encodeURIComponent(params.datasetId)}/values_agg`, { query })

  const formatAgg = (agg: any, indent: string): string => {
    let line = `${indent}- **${agg.value}**: ${agg.total} rows`
    if (params.metric && params.metric.type !== 'count' && agg.metric != null) {
      line += `, ${params.metric.type}(${params.metric.column}) = ${agg.metric}`
    }
    if (agg.aggs?.length) {
      line += '\n' + agg.aggs.map((sub: any) => formatAgg(sub, indent + '  ')).join('\n')
    }
    return line
  }

  return [
    `**${data.total}** total rows, **${data.total_values}** groups shown, **${data.total_other}** rows not represented`,
    '',
    ...(data.aggs ?? []).map((agg: any) => formatAgg(agg, ''))
  ].join('\n')
}

export interface CalculateMetricParams {
  datasetId: string
  fieldKey: string
  metric: string
  percents?: string
  filters?: Record<string, string>
  bbox?: string
  geoDistance?: string
  dateMatch?: string
}

export async function executeCalculateMetric (params: CalculateMetricParams, fetchFn: FetchFn) {
  const query: Record<string, string> = {
    metric: params.metric,
    field: params.fieldKey
  }
  if (params.percents) query.percents = params.percents
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      query[key] = String(value)
    }
  }
  applyGeoParams(query, params.bbox, params.geoDistance)
  applyDateMatchParam(query, params.dateMatch)

  const data = await fetchFn<any>(`datasets/${encodeURIComponent(params.datasetId)}/metric_agg`, { query })

  let result: string
  if (params.metric === 'stats' && typeof data.metric === 'object') {
    result = Object.entries(data.metric).map(([k, v]) => `${k}: ${v}`).join(', ')
  } else if (params.metric === 'percentiles' && typeof data.metric === 'object') {
    result = Object.entries(data.metric).map(([k, v]) => `p${k}: ${v}`).join(', ')
  } else {
    result = String(data.metric)
  }

  return [
    `**${params.metric}** of \`${params.fieldKey}\``,
    `Total rows: ${data.total}`,
    `Result: **${result}**`
  ].join('\n')
}

export async function executeGetFieldValues (params: { datasetId: string, fieldKey: string, q?: string, sort?: string, size?: number }, fetchFn: FetchFn) {
  const query: Record<string, string> = {
    size: String(Math.min(Math.max(params.size || 10, 1), 1000))
  }
  if (params.q) query.q = params.q
  if (params.sort) query.sort = params.sort

  const values = await fetchFn<any>(
    `datasets/${encodeURIComponent(params.datasetId)}/values/${encodeURIComponent(params.fieldKey)}`,
    { query }
  )

  return [
    `Distinct values of \`${params.fieldKey}\`:`,
    '',
    ...values.map((v: any) => `- ${v}`)
  ].join('\n')
}
