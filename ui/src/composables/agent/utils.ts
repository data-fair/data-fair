import type { Ref } from 'vue'
import { $fetch } from '~/context'

type Messages = Record<string, Record<string, string>>

/**
 * Create a translation function for agent tool annotations.
 * Falls back to English, then to the key itself.
 */
export function createAgentTranslator (messages: Messages, locale: Ref<string>) {
  return (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key
}

/**
 * Format an error for agent tool error responses.
 */
export function agentToolError (label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: 'text' as const, text: `${label}: ${message}` }],
    isError: true
  }
}

/**
 * Escape a value for CSV output.
 */
export function csvEscape (value: any): string {
  if (value == null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Convert an array of row objects to CSV text.
 */
export function toCsv (rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.map(csvEscape).join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\n')
}

/**
 * Remove internal fields (_id, _i, _rand) from a data row.
 */
export function cleanRow (row: any): any {
  const { _id, _i, _rand, ...clean } = row
  return clean
}

/**
 * Fetch sample rows from a dataset, cleaned of internal fields.
 */
export async function fetchSampleRows (datasetId: string, size = 5, select?: string): Promise<{ total: number, rows: Record<string, any>[] }> {
  const query: Record<string, string> = { size: String(size) }
  if (select) query.select = select
  const data = await $fetch<any>(`datasets/${encodeURIComponent(datasetId)}/lines`, { query })
  const rows = (data.results ?? []).map(cleanRow)
  return { total: data.total, rows }
}

/**
 * Build a paginated query object from common list tool parameters.
 */
export function buildPaginatedQuery (params: { q?: string, page?: number, size?: number }, extra?: Record<string, string>): { query: Record<string, string>, page: number, size: number } {
  const size = Math.min(Math.max(params.size || 10, 1), 50)
  const page = Math.max(params.page || 1, 1)
  const query: Record<string, string> = {
    size: String(size),
    page: String(page),
    ...extra
  }
  if (params.q) query.q = params.q
  return { query, page, size }
}
