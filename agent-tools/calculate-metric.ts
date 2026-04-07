import { datasetIdProperty, filterProperties } from './_utils.js'

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
      fieldKey: { type: 'string' as const, description: 'The column key to calculate the metric on (use keys from describe_dataset)' },
      metric: { type: 'string' as const, description: 'Metric to calculate. Available: avg, sum, min, max (for numbers); min, max, cardinality, value_count (for strings); value_count (for others); stats returns count/min/max/avg/sum; percentiles returns distribution.' },
      percents: { type: 'string' as const, description: 'Comma-separated percentages for percentiles metric (default: "1,5,25,50,75,95,99"). Only used when metric is "percentiles".' },
      ...filterProperties
    },
    required: ['datasetId', 'fieldKey', 'metric'] as const
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: { type: 'string' as const, description: 'The dataset ID that was queried' },
      fieldKey: { type: 'string' as const, description: 'The column key that was queried' },
      total: { type: 'number' as const, description: 'Total number of rows included in the calculation' },
      metric: { type: 'object' as const, description: 'The calculated metric value. For avg/sum/min/max/value_count/cardinality: a single number. For stats: an object {count, min, max, avg, sum}. For percentiles: an object mapping percentage strings to values, e.g. {"25": 30000, "50": 42000, "75": 55000}.' }
    },
    required: ['datasetId', 'fieldKey', 'total', 'metric'] as const
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

export function formatResult (data: any, params: Params): { text: string, structuredContent: Record<string, any> } {
  let result: string
  if (params.metric === 'stats' && typeof data.metric === 'object') {
    result = Object.entries(data.metric).map(([k, v]) => `${k}: ${v}`).join(', ')
  } else if (params.metric === 'percentiles' && typeof data.metric === 'object') {
    result = Object.entries(data.metric).map(([k, v]) => `p${k}: ${v}`).join(', ')
  } else {
    result = String(data.metric)
  }

  return {
    text: [
      `**${params.metric}** of \`${params.fieldKey}\``,
      `Total rows: ${data.total}`,
      `Result: **${result}**`
    ].join('\n'),
    structuredContent: {
      datasetId: params.datasetId,
      fieldKey: params.fieldKey,
      total: data.total,
      metric: data.metric
    }
  }
}
