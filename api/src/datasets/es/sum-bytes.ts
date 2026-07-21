import config from '#config'
import { aliasName } from './commons.ts'
import es from '#es'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { Dataset } from '#types'

// total CSV-equivalent size of the indexed lines: sum of the _bytes field stamped
// on every doc by index-stream (see the indexed_bytes metric in storage.ts)
// returns null whenever the sum cannot be trusted; the caller then keeps its
// legacy-computed indexed value instead of failing the whole storage update:
// - index/alias does not exist: e.g. the transient window in the middle of a full rebuild
// - incomplete _bytes coverage: see the check below
// contexts with no ES client at all (the files-processor worker pool) must not call this —
// they declare it by passing esUnavailable to updateStorage (see UpdateStorageOptions in
// storage.ts); a call without a connected client lands in the catch below and is reported
export default async (dataset: Dataset): Promise<number | null> => {
  try {
    const esResponse: any = await es.client.search({
      index: aliasName(dataset),
      // a missing index/alias matches 0 shards instead of erroring, detected below
      ignore_unavailable: true,
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
    // 0 shards searched = the index/alias does not exist (an existing index has >= 1 shard,
    // even when empty) — distinguishes "no data yet" (a legitimate sum of 0) from "no index"
    if (!esResponse._shards?.total) return null
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
  } catch (err) {
    // no expected condition flows through here (a missing index is handled above without
    // throwing, ES-less contexts don't call at all) — this is a last-resort guarantee that
    // storage accounting never crashes on an ES anomaly, and anything caught is worth reporting
    internalError('es-sum-bytes', err)
    return null
  }
}
