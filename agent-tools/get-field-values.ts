import { datasetIdProperty } from './_utils.ts'

export const annotations = {
  fr: { title: 'Obtenir les valeurs distinctes' },
  en: { title: 'Get distinct values' }
} as const

export const schema = {
  name: 'get_field_values',
  description: 'List distinct values of a column. Useful to discover values before filtering with _eq or _in.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: datasetIdProperty,
      fieldKey: { type: 'string' as const, description: 'The column key to get values for (use keys from describe_dataset)' },
      q: { type: 'string' as const, description: 'Optional text to filter values (prefix/substring match within this column)' },
      sort: { type: 'string' as const, description: 'Sort order for the values (default: asc)' },
      size: { type: 'number' as const, description: 'Number of values to return (default: 10, max: 1000)' }
    },
    required: ['datasetId', 'fieldKey'] as const
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      datasetId: { type: 'string' as const, description: 'The dataset ID that was queried' },
      fieldKey: { type: 'string' as const, description: 'The column key that was queried' },
      values: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Array of distinct values for the specified column'
      }
    },
    required: ['datasetId', 'fieldKey', 'values'] as const
  }
} as const

export interface Params {
  datasetId: string
  fieldKey: string
  q?: string
  sort?: string
  size?: number
}

export function buildQuery (params: Params): { path: string, query: Record<string, string> } {
  const query: Record<string, string> = {
    size: String(Math.min(Math.max(params.size || 10, 1), 1000))
  }
  if (params.q) query.q = params.q
  if (params.sort) query.sort = params.sort

  return {
    path: `datasets/${encodeURIComponent(params.datasetId)}/values/${encodeURIComponent(params.fieldKey)}`,
    query
  }
}

export function formatResult (values: any[], params: Params): { text: string, structuredContent: Record<string, any> } {
  return {
    text: [
      `Distinct values of \`${params.fieldKey}\`:`,
      '',
      ...values.map((v: any) => `- ${v}`)
    ].join('\n'),
    structuredContent: {
      datasetId: params.datasetId,
      fieldKey: params.fieldKey,
      values
    }
  }
}
