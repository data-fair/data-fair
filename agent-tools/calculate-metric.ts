import { datasetIdProperty, filterProperties } from './_utils.ts'

export const annotations = {
  fr: { title: 'Calculer une métrique' },
  en: { title: 'Calculate a metric' }
} as const

export const schema = {
  name: 'calculate_metric',
  description: 'Calculate a single metric on a dataset column: avg, sum, min, max, stats, value_count, cardinality, percentiles. For per-group breakdowns, use aggregate_data.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty,
      fieldKey: { type: 'string' as const, description: 'Column key to compute the metric on' },
      metric: { type: 'string' as const, description: 'One of: avg, sum, min, max, stats, value_count, cardinality, percentiles' },
      percents: { type: 'string' as const, description: 'For percentiles: comma-separated percentages (default "1,5,25,50,75,95,99")' },
      ...filterProperties
    },
    required: ['datasetId', 'fieldKey', 'metric'] as const
  }
} as const

export interface Params {
  datasetId: string
  fieldKey: string
  metric: string
  percents?: string
  filters?: Record<string, any>
  bbox?: string
  geoDistance?: string
  dateMatch?: string
}

export function buildQuery (params: Params): { path: string, query: Record<string, string> } {
  const query: Record<string, string> = {
    metric: params.metric,
    field: params.fieldKey
  }
  if (params.percents) query.percents = params.percents
  if (params.filters) { for (const [key, value] of Object.entries(params.filters)) query[key] = String(value) }
  if (params.bbox) query.bbox = params.bbox
  if (params.geoDistance) query.geo_distance = params.geoDistance
  if (params.dateMatch) query.date_match = params.dateMatch

  return {
    path: `datasets/${encodeURIComponent(params.datasetId)}/metric_agg`,
    query
  }
}

export function formatResult (data: any, params: { fieldKey: string, metric: string }): string {
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
