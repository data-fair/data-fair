import { cleanRow, toCsv, formatSchemaColumns, datasetIdProperty } from './_utils.js'

export const annotations = {
  fr: { title: 'Obtenir le schéma du jeu de données' },
  en: { title: 'Get dataset schema' }
} as const

export const schema = {
  name: 'get_dataset_schema',
  description: 'Get column schema and 3 sample rows for a dataset. Always call this first before querying data to understand the structure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty
    },
    required: ['datasetId'] as const
  }
} as const

export interface Params {
  datasetId: string
}

export function buildQuery (params: Params): {
  schemaReq: { path: string, query: Record<string, string> }
  samplesReq: { path: string, query: Record<string, string> }
} {
  const id = encodeURIComponent(params.datasetId)
  return {
    schemaReq: { path: `datasets/${id}`, query: { select: 'schema,title' } },
    samplesReq: { path: `datasets/${id}/lines`, query: { size: '3' } }
  }
}

export function formatResult (dataset: any, linesData: any): string {
  const schema = formatSchemaColumns(dataset.schema)
  const samples = (linesData.results ?? []).map(cleanRow)

  return [
    `# Schema: ${dataset.title}`,
    '| Key | Type | Title | Notes |',
    '|-----|------|-------|-------|',
    ...(schema || []),
    '',
    '## Sample data',
    toCsv(samples)
  ].join('\n')
}
