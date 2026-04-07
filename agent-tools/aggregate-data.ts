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
        description: 'Columns to GROUP BY (like SQL GROUP BY). These define the categories/buckets, NOT the column to compute metrics on. Use column keys from describe_dataset (min 1, max 3).'
      },
      metric: {
        type: 'object' as const,
        properties: {
          column: { type: 'string' as const, description: 'The column to compute the metric ON (e.g., "salary" for average salary). This is NOT the grouping column. Use column keys from describe_dataset.' },
          type: { type: 'string' as const, description: 'Metric to compute on each group. "count" counts rows per group (identical to omitting the metric parameter — does NOT count non-null values of the specified column).' }
        },
        description: 'Optional metric to compute ON EACH GROUP. If not provided, defaults to counting rows per group.'
      },
      ...filterProperties,
      sort: { type: 'string' as const, description: 'Sort order for aggregation results. Use special keys: "count" or "-count" (by row count asc/desc), "key" or "-key" (by column value asc/desc), "metric" or "-metric" (by metric value asc/desc). Default: sorts by metric desc (if metric specified), then count desc. Example: "-count" to sort by most frequent values first' }
    },
    required: ['datasetId', 'groupByColumns'] as const
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: { type: 'string' as const, description: 'The dataset ID that was aggregated' },
      total: { type: 'number' as const, description: 'The total number of rows in the dataset' },
      total_values: { type: 'number' as const, description: 'The total number of different values aggregated across all specified columns' },
      total_other: { type: 'number' as const, description: 'Number of rows NOT included in the returned aggregations (only the top groups are returned). Add this to the sum of all group totals to reconstruct the dataset total.' },
      aggs: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            total: { type: 'number' as const, description: 'Total number of rows aggregated for this group' },
            total_values: { type: 'number' as const, description: 'Total number of different values aggregated for this group' },
            total_other: { type: 'number' as const, description: 'Number of rows NOT included in the returned aggregations for this group' },
            value: { description: 'The value of the aggregated column (string or number)' },
            metric: { type: 'number' as const, description: 'The value of the aggregation metric (e.g., sum, avg) on the selected column' },
            aggs: { type: 'array' as const, items: { type: 'object' as const }, description: 'Nested aggregation results when multiple columns are specified (max 3 levels deep)' }
          }
        },
        description: 'Array of aggregation results for each group (limited to 20 rows)'
      }
    },
    required: ['datasetId', 'total', 'total_values', 'total_other', 'aggs'] as const
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

export function formatResult (data: any, params: Params): { text: string, structuredContent: Record<string, any> } {
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

  const text = [
    `**${data.total}** total rows, **${data.total_values}** groups shown, **${data.total_other}** rows not represented`,
    '',
    ...(data.aggs ?? []).map((agg: any) => formatAgg(agg, ''))
  ].join('\n')

  return {
    text,
    structuredContent: {
      datasetId: params.datasetId,
      total: data.total,
      total_values: data.total_values,
      total_other: data.total_other,
      aggs: data.aggs ?? []
    }
  }
}
