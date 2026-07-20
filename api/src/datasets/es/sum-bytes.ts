import config from '#config'
import { aliasName } from './commons.ts'
import es from '#es'

// total CSV-equivalent size of the indexed lines: sum of the _bytes field stamped
// on every doc by index-stream (see the indexed_bytes metric in storage.ts)
// returns null if the index/alias does not exist (e.g. mid-rebuild transient window)
export default async (dataset: any): Promise<number | null> => {
  try {
    const esResponse: any = await es.client.search({
      index: aliasName(dataset),
      body: { size: 0, track_total_hits: false, aggs: { bytes: { sum: { field: '_bytes' } } } },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })
    return Math.round((esResponse.aggregations?.bytes as any)?.value ?? 0)
  } catch (err: any) {
    // 404 / index_not_found_exception: the index doesn't exist yet (e.g. mid-rebuild) — let the
    // caller keep its legacy-computed indexed value instead of failing the whole storage update
    if (err?.meta?.statusCode === 404 || err?.statusCode === 404) return null
    throw err
  }
}
