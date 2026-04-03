import { datasetIdProperty, filterProperties } from './_utils.ts'

export const annotations = {
  fr: { title: 'Agréger des données' },
  en: { title: 'Aggregate data' }
} as const

export const schema = {
  name: 'aggregate_data',
  description: 'Aggregate dataset rows by 1-3 columns with optional metric (sum, avg, min, max, count). Defaults to counting rows per group. For a single global metric without grouping, use calculate_metric.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty,
      groupByColumns: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Columns to group by (1-3 column keys)'
      },
      metric: {
        type: 'object' as const,
        properties: {
          column: { type: 'string' as const, description: 'Column to compute the metric on' },
          type: { type: 'string' as const, description: 'One of: sum, avg, min, max, count' }
        },
        description: 'Optional metric to compute on each group'
      },
      ...filterProperties,
      sort: { type: 'string' as const, description: 'Sort: count/-count, key/-key, metric/-metric' }
    },
    required: ['datasetId', 'groupByColumns'] as const
  }
} as const

export interface Params {
  datasetId: string
  groupByColumns: string[]
  metric?: { column?: string, type?: string }
  filters?: Record<string, any>
  sort?: string
  bbox?: string
  geoDistance?: string
  dateMatch?: string
}

export function buildQuery (params: Params): { path: string, query: Record<string, string> } {
  const query: Record<string, string> = {
    field: params.groupByColumns.join(';')
  }
  if (params.metric && params.metric.type && params.metric.type !== 'count') {
    query.metric = params.metric.type
    if (params.metric.column) query.metric_field = params.metric.column
  }
  if (params.sort) query.sort = params.sort
  if (params.filters) { for (const [key, value] of Object.entries(params.filters)) query[key] = String(value) }
  if (params.bbox) query.bbox = params.bbox
  if (params.geoDistance) query.geo_distance = params.geoDistance
  if (params.dateMatch) query.date_match = params.dateMatch

  return {
    path: `datasets/${encodeURIComponent(params.datasetId)}/values_agg`,
    query
  }
}

export function formatResult (data: any, metric?: { column?: string, type?: string }): string {
  const formatAgg = (agg: any, indent: string): string => {
    let line = `${indent}- **${agg.value}**: ${agg.total} rows`
    if (metric && metric.type !== 'count' && agg.metric != null) {
      line += `, ${metric.type}(${metric.column}) = ${agg.metric}`
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
