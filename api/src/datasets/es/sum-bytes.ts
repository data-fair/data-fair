import config from '#config'
import { aliasName } from './commons.ts'
import es from '#es'
import { internalError } from '@data-fair/lib-node/observer.js'

// total CSV-equivalent size of the indexed lines: sum of the _bytes field stamped
// on every doc by index-stream (see the indexed_bytes metric in storage.ts)
// returns null if the index/alias does not exist (e.g. mid-rebuild transient window), or if the
// sum is not trustworthy (see coverage check below)
// this function must NEVER throw: storage accounting (storage()/updateStorage()) can run in
// worker contexts that have no ES client connected at all (e.g. files-processor), where even
// accessing es.client throws synchronously — any failure here must degrade gracefully so the
// caller falls back to its legacy-computed indexed value instead of crashing the whole task
export default async (dataset: any): Promise<number | null> => {
  try {
    const esResponse: any = await es.client.search({
      index: aliasName(dataset),
      body: {
        size: 0,
        track_total_hits: true,
        aggs: {
          bytes: { sum: { field: '_bytes' } },
          // count of docs actually stamped with _bytes: compared against the total hit count
          // below, this is the coverage check (see comment further down)
          bytesCount: { value_count: { field: '_bytes' } }
        }
      },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })
    const totalHits = esResponse.hits?.total?.value ?? 0
    const bytesCount = (esResponse.aggregations?.bytesCount as any)?.value ?? 0
    // coverage check: the sum is only valid if EVERY doc in the index carries a _bytes value.
    // rolling-deploy windows can leave a marked dataset's index with a mix of stamped and
    // unstamped docs (e.g. a REST dataset created by a new API pod gets the marker, but the
    // first batch of lines is indexed by an old worker replica that doesn't stamp _bytes yet).
    // this converts any such marker-lies scenario (rolling deploys, future unstamped writers)
    // into the tested legacy fallback instead of a silent under-count
    if (bytesCount !== totalHits) return null
    return Math.round((esResponse.aggregations?.bytes as any)?.value ?? 0)
  } catch (err: any) {
    // 404 / index_not_found_exception: the index doesn't exist yet (e.g. mid-rebuild) — let the
    // caller keep its legacy-computed indexed value instead of failing the whole storage update
    if (err?.meta?.statusCode === 404 || err?.statusCode === 404) return null
    // the files-processor worker pool connects to Mongo only, never to ES (see
    // workers/files-processor/index.ts) — its tasks (analyze-csv, analyze-geojson, normalize)
    // still call updateStorage, so for _esLineBytes datasets we hit this on every run of those
    // tasks. es.ts throws this exact message synchronously when the client was never connected;
    // that's an expected, permanent condition here, not an error worth paging on
    if (err instanceof Error && err.message === 'db was not connected') return null
    internalError('es-sum-bytes', err)
    return null
  }
}
