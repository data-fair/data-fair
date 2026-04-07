import { $fetch } from '~/context'
import { cleanRow } from './utils-logic'

export {
  createAgentTranslator,
  agentToolError,
  csvEscape,
  toCsv,
  cleanRow,
  buildPaginatedQuery
} from './utils-logic'

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
