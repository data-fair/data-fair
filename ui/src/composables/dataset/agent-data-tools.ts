import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    getDatasetSchema: 'Obtenir le schéma du jeu de données',
    searchData: 'Rechercher des lignes de données',
    aggregateData: 'Agréger des données',
    calculateMetric: 'Calculer une métrique',
    getFieldValues: 'Obtenir les valeurs distinctes',
    datasetDataSubAgent: 'Interroger les données d\'un jeu de données',
    datasetDataSubAgentDesc: 'Interroger les lignes d\'un jeu de données, calculer des agrégations et explorer les valeurs des colonnes. Fournissez l\'identifiant du jeu de données et décrivez les données dont vous avez besoin.'
  },
  en: {
    getDatasetSchema: 'Get dataset schema',
    searchData: 'Search data rows',
    aggregateData: 'Aggregate data',
    calculateMetric: 'Calculate a metric',
    getFieldValues: 'Get distinct values',
    datasetDataSubAgent: 'Query dataset data',
    datasetDataSubAgentDesc: 'Query dataset rows, compute aggregations, and explore field values. Provide the dataset ID and describe what data you need.'
  }
}

const filtersDescription = 'Column filters as key-value pairs. Key format: column_key + suffix (_eq, _neq, _search, _in, _nin, _starts, _contains, _gte, _gt, _lte, _lt, _exists, _nexists). All values must be strings. Example: {"nom_search":"Jean","age_lte":"30"}'

function csvEscape (value: any): string {
  if (value == null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv (rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.map(csvEscape).join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\n')
}

function cleanRow (row: any): any {
  const { _id, _i, _rand, ...clean } = row
  return clean
}

function applyGeoParams (query: Record<string, string>, bbox?: string, geoDistance?: string) {
  if (bbox) query.bbox = bbox
  if (geoDistance) query.geo_distance = geoDistance
}

function applyDateMatchParam (query: Record<string, string>, dateMatch?: string) {
  if (dateMatch) query.date_match = dateMatch
}

/**
 * Drop incomplete _geo_distance sort entries (without :lon:lat suffix).
 * LLMs sometimes write sort: "_geo_distance" redundantly when a geoDistance filter is already present.
 * The API already auto-sorts by distance when a geo_distance filter is set.
 */
function normalizeSort (sort: string): string {
  return sort.split(',').map(part => {
    const trimmed = part.trim()
    if (/^-?_geo_distance$/.test(trimmed)) return null
    return trimmed
  }).filter(Boolean).join(',')
}

export function useAgentDatasetDataTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'get_dataset_schema',
    description: 'Get column schema and 3 sample rows for a dataset. Always call this first before querying data to understand the structure.',
    annotations: { title: t('getDatasetSchema'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' }
      },
      required: ['datasetId'] as const
    },
    execute: async (params) => {
      const [dataset, linesData] = await Promise.all([
        $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}`, { query: { select: 'schema,title' } }),
        $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}/lines`, { query: { size: '3' } })
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
  })

  useAgentTool({
    name: 'search_data',
    description: 'Search for data rows in a dataset using full-text search or column filters. Returns matching rows as CSV. Do NOT use for statistics — use calculate_metric or aggregate_data instead.',
    annotations: { title: t('searchData'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        q: { type: 'string' as const, description: 'Full-text search keywords (optional)' },
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        select: { type: 'string' as const, description: 'Comma-separated column keys to return (optional, defaults to all)' },
        sort: { type: 'string' as const, description: 'Sort order: column keys, prefix with - for desc. Special: _score, _i, _updatedAt, _rand, _geo_distance:lon:lat (distance from point, for geolocalized datasets)' },
        size: { type: 'number' as const, description: 'Page size (default 10, max 50)' },
        page: { type: 'number' as const, description: 'Page number (default 1)' },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax". Example: "-2.5,43,3,47"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km". Use distance "0" for point-in-polygon containment.' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD". ISO datetimes also accepted.' },
        next: { type: 'string' as const, description: 'URL from a previous search_data response to fetch the next page. When provided, all other parameters are ignored.' }
      },
      required: ['datasetId'] as const
    },
    execute: async (params) => {
      let data: any

      if (params.next) {
        data = await $fetch<any>(params.next)
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

        data = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}/lines`, { query })
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
  })

  useAgentTool({
    name: 'aggregate_data',
    description: 'Aggregate dataset rows by 1-3 columns with optional metric (sum, avg, min, max, count). Defaults to counting rows per group. For a single global metric without grouping, use calculate_metric.',
    annotations: { title: t('aggregateData'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
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
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km"' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD"' },
        sort: { type: 'string' as const, description: 'Sort: count/-count, key/-key, metric/-metric' }
      },
      required: ['datasetId', 'groupByColumns'] as const
    },
    execute: async (params) => {
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

      const data = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}/values_agg`, { query })

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
  })

  useAgentTool({
    name: 'calculate_metric',
    description: 'Calculate a single metric on a dataset column: avg, sum, min, max, stats, value_count, cardinality, percentiles. For per-group breakdowns, use aggregate_data.',
    annotations: { title: t('calculateMetric'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        fieldKey: { type: 'string' as const, description: 'Column key to compute the metric on' },
        metric: { type: 'string' as const, description: 'One of: avg, sum, min, max, stats, value_count, cardinality, percentiles' },
        percents: { type: 'string' as const, description: 'For percentiles: comma-separated percentages (default "1,5,25,50,75,95,99")' },
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km"' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD"' }
      },
      required: ['datasetId', 'fieldKey', 'metric'] as const
    },
    execute: async (params) => {
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

      const data = await $fetch<any>(`datasets/${encodeURIComponent(params.datasetId)}/metric_agg`, { query })

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
  })

  useAgentTool({
    name: 'get_field_values',
    description: 'List distinct values of a column. Useful to discover values before filtering with _eq or _in.',
    annotations: { title: t('getFieldValues'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        fieldKey: { type: 'string' as const, description: 'Column key to get values for' },
        q: { type: 'string' as const, description: 'Optional text to filter values' },
        sort: { type: 'string' as const, description: 'asc or desc (default asc)' },
        size: { type: 'number' as const, description: 'Number of values to return (default 10, max 1000)' }
      },
      required: ['datasetId', 'fieldKey'] as const
    },
    execute: async (params) => {
      const query: Record<string, string> = {
        size: String(Math.min(Math.max(params.size || 10, 1), 1000))
      }
      if (params.q) query.q = params.q
      if (params.sort) query.sort = params.sort

      const values = await $fetch<any>(
        `datasets/${encodeURIComponent(params.datasetId)}/values/${encodeURIComponent(params.fieldKey)}`,
        { query }
      )

      return [
        `Distinct values of \`${params.fieldKey}\`:`,
        '',
        ...values.map((v: any) => `- ${v}`)
      ].join('\n')
    }
  })

  useAgentSubAgent({
    name: 'dataset_data',
    title: t('datasetDataSubAgent'),
    description: t('datasetDataSubAgentDesc'),
    prompt: `You are a data analyst assistant for a data platform. You help users explore and understand datasets by querying their content.

Workflow:
1. Always call get_dataset_schema first to understand column names, types, and sample data before using other tools.
2. Choose the right tool for the task:
   - get_field_values: to discover distinct values of a column before filtering
   - search_data: to retrieve specific rows matching filters or text search. Do NOT use for statistics.
   - aggregate_data: to group rows by columns and count or compute per-group metrics (sum, avg, min, max)
   - calculate_metric: to compute a single global statistic (avg, sum, min, max, stats, percentiles, cardinality)

Format:
- Present results concisely with clear labels
- For numeric results, round to 2 decimal places when appropriate
- When returning tabular data, summarize key findings rather than just dumping raw rows
- Respond in the same language as the user's question`,
    tools: ['get_dataset_schema', 'search_data', 'aggregate_data', 'calculate_metric', 'get_field_values']
  })
}
