import config from '#config'
import { aliasName } from './commons.ts'
import es from '#es'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { Dataset } from '#types'

// total CSV-equivalent size of the indexed lines: sum of the _bytes field stamped
// on every doc by index-stream (see the indexed_bytes metric in storage.ts)
// the sum is trusted optimistically whenever _esLineBytes is on: a rolling-deploy window can
// leave a marked index with some unstamped docs (an old worker replica indexing lines for a
// dataset marked by a new pod), transiently under-counting until the next full reindex —
// accepted, pod version mismatches are not managed here or anywhere else in the app
// returns null only when the sum cannot be computed at all; the caller then keeps its
// legacy-computed indexed value instead of failing the whole storage update:
// - index/alias does not exist: e.g. the transient window in the middle of a full rebuild
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
        aggs: {
          bytes: { sum: { field: '_bytes' } }
        }
      },
      timeout: config.elasticsearch.searchTimeout,
      allow_partial_search_results: false
    })
    // 0 shards searched = the index/alias does not exist (an existing index has >= 1 shard,
    // even when empty) — distinguishes "no data yet" (a legitimate sum of 0) from "no index"
    if (!esResponse._shards?.total) return null
    return Math.round((esResponse.aggregations?.bytes as any)?.value ?? 0)
  } catch (err) {
    // no expected condition flows through here (a missing index is handled above without
    // throwing, ES-less contexts don't call at all) — this is a last-resort guarantee that
    // storage accounting never crashes on an ES anomaly, and anything caught is worth reporting
    internalError('es-sum-bytes', err)
    return null
  }
}
