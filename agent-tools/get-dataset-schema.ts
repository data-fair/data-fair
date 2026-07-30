import { cleanRow, toCsv, formatSchemaColumns, datasetIdProperty } from './_utils.js'

export const annotations = {
  fr: { title: 'Obtenir le schéma du jeu de données' },
  en: { title: 'Get dataset schema' }
} as const

export const schema = {
  name: 'get_dataset_schema',
  description: 'Get column schema and 3 sample rows for a dataset. Call this when you do not already know the column keys and types — if they were provided to you (e.g. by the parent assistant), skip it and query directly. A rejected filter/sort/metric returns a 400 listing the column\'s valid operations, so you can self-correct without fetching the schema upfront.',
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
    schemaReq: { path: `datasets/${id}`, query: { select: 'schema,title,slug' } },
    samplesReq: { path: `datasets/${id}/lines`, query: { size: '3' } }
  }
}

export function formatResult (dataset: any, linesData: any): string {
  const schema = formatSchemaColumns(dataset.schema)
  const samples = (linesData.results ?? []).map(cleanRow)

  return [
    `# Schema: ${dataset.title}`,
    ...(dataset.slug ? [`- **Slug:** ${dataset.slug}`, ''] : []),
    '| Key | Type | Title | Notes |',
    '|-----|------|-------|-------|',
    ...(schema || []),
    '',
    '## Sample data',
    toCsv(samples)
  ].join('\n')
}
