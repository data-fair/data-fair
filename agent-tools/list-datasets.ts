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
      q: { type: 'string' as const, description: 'Optional text search keywords' },
      page: { type: 'number' as const, description: 'Page number (default 1)' },
      size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
    }
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
    select: 'title,status,topics,count,updatedAt',
    size: String(size),
    page: String(page)
  }
  if (params.q) query.q = params.q

  return {
    path: catalogMode ? 'catalog/datasets' : 'datasets',
    query
  }
}

export function formatResult (data: any, page: number, size: number): string {
  const lines = data.results.map((d: any) => {
    const parts = [`- **${d.title || d.id}** (id: \`${d.id}\`)`,
      `  Status: ${d.status || 'unknown'}, ${d.count ?? '?'} rows, updated ${d.updatedAt || '?'}`]
    if (d.topics?.length) parts.push(`  Topics: ${d.topics.map((t: any) => t.title).join(', ')}`)
    return parts.join('\n')
  })

  return [
    `**${data.count}** datasets found (page ${page}, ${size} per page)`,
    '',
    ...lines
  ].join('\n')
}
