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
      fieldKey: { type: 'string' as const, description: 'Column key to get values for' },
      q: { type: 'string' as const, description: 'Optional text to filter values' },
      sort: { type: 'string' as const, description: 'asc or desc (default asc)' },
      size: { type: 'number' as const, description: 'Number of values to return (default 10, max 1000)' }
    },
    required: ['datasetId', 'fieldKey'] as const
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

export function formatResult (values: any[], fieldKey: string): string {
  return [
    `Distinct values of \`${fieldKey}\`:`,
    '',
    ...values.map((v: any) => `- ${v}`)
  ].join('\n')
}
