import { normalizeSort, cleanRow, toCsv, datasetIdProperty, filterProperties } from './_utils.ts'

export const annotations = {
  fr: { title: 'Rechercher des lignes de données' },
  en: { title: 'Search data rows' }
} as const

export const schema = {
  name: 'search_data',
  description: 'Search for data rows in a dataset using full-text search or column filters. Returns matching rows as CSV. Do NOT use for statistics — use calculate_metric or aggregate_data instead.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty,
      q: { type: 'string' as const, description: 'Full-text search keywords (optional)' },
      ...filterProperties,
      select: { type: 'string' as const, description: 'Comma-separated column keys to return (optional, defaults to all)' },
      sort: { type: 'string' as const, description: 'Sort order: column keys, prefix with - for desc. Special: _score, _i, _updatedAt, _rand, _geo_distance:lon:lat (distance from point, for geolocalized datasets)' },
      size: { type: 'number' as const, description: 'Page size (default 10, max 50)' },
      page: { type: 'number' as const, description: 'Page number (default 1)' },
      next: { type: 'string' as const, description: 'URL from a previous search_data response to fetch the next page. When provided, all other parameters are ignored.' }
    },
    required: ['datasetId'] as const
  }
} as const

export interface Params {
  datasetId: string
  q?: string
  filters?: Record<string, any>
  select?: string
  sort?: string
  size?: number
  page?: number
  bbox?: string
  geoDistance?: string
  dateMatch?: string
}

export function buildQuery (params: Params): { path: string, query: Record<string, string> } {
  const size = Math.min(Math.max(params.size || 10, 1), 50)
  const query: Record<string, string> = { size: String(size) }
  if (params.q) { query.q = params.q; query.q_mode = 'complete' }
  if (params.select) query.select = params.select
  if (params.sort) {
    const normalized = normalizeSort(params.sort)
    if (normalized) query.sort = normalized
  }
  if (params.page) query.page = String(params.page)
  if (params.filters) { for (const [key, value] of Object.entries(params.filters)) query[key] = String(value) }
  if (params.bbox) query.bbox = params.bbox
  if (params.geoDistance) query.geo_distance = params.geoDistance
  if (params.dateMatch) query.date_match = params.dateMatch

  return {
    path: `datasets/${encodeURIComponent(params.datasetId)}/lines`,
    query
  }
}

export function formatResult (data: any, params: { page?: number }): string {
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
