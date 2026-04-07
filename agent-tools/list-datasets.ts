export const annotations = {
  fr: { title: 'Lister les jeux de données' },
  en: { title: 'List datasets' }
} as const

export const schema = {
  name: 'list_datasets',
  description: 'List datasets accessible to the current user with optional text search. Returns id, title, status, row count, and last update.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      q: { type: 'string' as const, description: 'French keywords for full-text search (simple terms, not sentences). If 0 results, try synonyms or broader terms. Examples: "élus", "DPE", "entreprises", "logement social"' },
      page: { type: 'number' as const, description: 'Page number (default 1)' },
      size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
    }
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      count: { type: 'number' as const, description: 'Number of datasets matching the search criteria' },
      results: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'Unique dataset ID (required for describe_dataset and search_data tools)' },
            title: { type: 'string' as const, description: 'Dataset title' },
            page: { type: 'string' as const, description: 'Link to the dataset page (must be included in responses as citation source)' },
            summary: { type: 'string' as const, description: 'A summary of the dataset content' }
          }
        },
        description: 'An array of datasets matching the search criteria.'
      }
    },
    required: ['count', 'results'] as const
  }
} as const

export interface Params {
  q?: string
  page?: number
  size?: number
}

export function buildQuery (params: Params, catalogMode?: boolean): { path: string, query: Record<string, string> } {
  const size = Math.min(Math.max(params.size || 10, 1), 50)
  const page = Math.max(params.page || 1, 1)
  const query: Record<string, string> = {
    select: 'id,title,summary,topics,count',
    size: String(size),
    page: String(page)
  }
  if (params.q) query.q = params.q

  return {
    path: catalogMode ? 'catalog/datasets' : 'datasets',
    query
  }
}

export function formatResult (data: any, page: number, size: number): { text: string, structuredContent: Record<string, any> } {
  const rows = data.results ?? []
  const results = rows.map((d: any) => {
    const r: any = {
      id: d.id,
      title: d.title,
      page: d.page
    }
    if (d.summary) r.summary = d.summary
    return r
  })

  const lines = rows.map((d: any) => {
    const parts = [`- **${d.title || d.id}** (id: \`${d.id}\`)`,
      `  Status: ${d.status || 'unknown'}, ${d.count ?? '?'} rows, updated ${d.updatedAt || '?'}`]
    if (d.topics?.length) parts.push(`  Topics: ${d.topics.map((t: any) => t.title).join(', ')}`)
    return parts.join('\n')
  })

  return {
    text: [
      `**${data.count}** datasets found (page ${page}, ${size} per page)`,
      '',
      ...lines
    ].join('\n'),
    structuredContent: {
      count: data.count,
      results
    }
  }
}
