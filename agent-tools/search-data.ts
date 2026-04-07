import { normalizeSort, cleanRow, toCsv, datasetIdProperty, filterProperties } from './_utils.js'

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
      q: { type: 'string' as const, description: 'French keywords for full-text search across all dataset columns (simple keywords, not sentences). Can be combined with filters, but prefer filters alone when criteria target specific columns. Use query for broad keyword matching across all columns. Examples: "Jean Dupont", "Paris", "2025"' },
      ...filterProperties,
      select: { type: 'string' as const, description: 'Optional comma-separated list of column keys to include in the results. Useful when the dataset has many columns to reduce output size. If not provided, all columns are returned. Use column keys from describe_dataset. Format: column1,column2,column3 (No spaces after commas). Example: "nom,age,ville"' },
      sort: { type: 'string' as const, description: 'Sort order for results. Comma-separated list of column keys. Prefix with - for descending order. Special keys: _score (relevance), _i (index order), _updatedAt, _rand (random), _geo_distance:lon:lat (distance from point, for geolocalized datasets). Examples: "population" (ascending), "-population" (descending), "_geo_distance:2.35:48.85" (closest first)' },
      size: { type: 'number' as const, description: 'Number of rows to return per page (default: 10, max: 50). Increase when you know you need more results upfront to avoid multiple pagination round-trips.' },
      page: { type: 'number' as const, description: 'Page number (default 1)' },
      next: { type: 'string' as const, description: 'URL from a previous search_data response to fetch the next page of results. When provided, all other parameters (query, filters, select, sort, size) are ignored since the URL already contains them.' }
    },
    required: ['datasetId'] as const
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: { type: 'string' as const, description: 'The dataset ID that was searched' },
      total: { type: 'number' as const, description: 'Number of data rows matching the search criteria and filters' },
      results: {
        type: 'array' as const,
        items: { type: 'object' as const, description: 'Data row object containing column keys as object keys with their values' },
        description: 'An array of data rows matching the search criteria (up to the requested size).'
      },
      next: { type: 'string' as const, description: 'URL to fetch the next page of results. Absent when there are no more results. Pass this value as the next input parameter to get the next page.' }
    },
    required: ['datasetId', 'total', 'results'] as const
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
  if (params.select) query.select = params.select.split(',').map(s => s.trim()).join(',')
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

export function formatResult (data: any, params: Params): { text: string, structuredContent: Record<string, any> } {
  const rows = (data.results ?? []).map(cleanRow)
  const lines = [
    `**${data.total}** rows found (showing ${rows.length}, page ${params.page || 1})`,
    '',
    toCsv(rows)
  ]
  if (data.next) {
    lines.push('', 'Next page available.')
  }
  const structuredContent: Record<string, any> = {
    datasetId: params.datasetId,
    total: data.total,
    results: rows
  }
  if (data.next) structuredContent.next = data.next
  return { text: lines.join('\n'), structuredContent }
}
