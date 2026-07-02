import type { Readable } from 'node:stream'
import { createHitSplitter } from './hits-splitter.ts'
import type { LinesSource } from '../routes/lines-source.ts'

// Bridge a raw ES `_search` response stream (the body of an `asStream` request, already gunzipped) into a
// `LinesSource`. The hits-splitter slices the response into: a prefix (through the hits `[`), each hit's
// bytes, and a tail (from the `]`). We pull chunks from the stream on demand and feed the splitter:
//  - creation consumes NOTHING from the stream: the first `hits` pull feeds the splitter. Since the /lines
//    body is assembled before res.send, no consumer needs anything (total included) before the hits are
//    drained — which is also what keeps memory bounded when ES omits `hits.total` entirely
//    (track_total_hits:false on after= pages / count=false).
//  - `hits` is a pull-based async generator: it drains the hits buffered from the last chunk in
//    ~BATCH_BYTES groups (one JSON.parse per group), then reads the next chunk and feeds the splitter — so
//    at most one chunk's worth of hits is held in memory at a time (never the whole result set).
//    Backpressure is natural: no chunk is read until the consumer pulls the next hit.
//  - `tail()` finishes consuming the stream (if not already) and returns the whole envelope skeleton
//    (`{ hits: { total? }, _shards, aggregations, … }` with an empty `hits.hits`) via `JSON.parse` of
//    prefix+tail — consumers read `total` from it (`tail.hits.total?.value`) once the hits are drained.
//
// This module is intentionally free of any `#config` import so it can be unit-tested against a synthetic
// `Readable` without a config directory (see search-stream.unit.spec.ts).
// Byte-adaptive parse batching: accumulate complete hit slices until their combined size reaches this,
// then JSON.parse them as a single array. Amortizes per-parse-call overhead (CPU is flat from ~4KB to
// ~100KB and degrades beyond ~256KB per the threshold sweep) while keeping peak bounded — fat rows
// collapse to one hit per batch, skinny rows pack many. See benchmark/results/streaming-threshold-sweep.md.
const BATCH_BYTES = 20 * 1024
const OPEN = Buffer.from('['); const CLOSE = Buffer.from(']'); const COMMA = Buffer.from(',')

export function streamToSource (stream: Readable): LinesSource {
  const pending: Buffer[] = []
  const splitter = createHitSplitter(b => pending.push(b))
  const iter = stream[Symbol.asyncIterator]()
  let ended = false

  const feedNext = async (): Promise<boolean> => {
    const { value, done } = await iter.next()
    if (done) { splitter.end(); ended = true; return false }
    splitter.write(value as Buffer)
    return true
  }

  async function * hits () {
    // Yields BULKS (each ~BATCH_BYTES of hits parsed with a single JSON.parse): fewer async-generator
    // steps than per-hit, and the consumer serializes a whole bulk per write. `cursor` walks the buffered
    // slices without Array.shift (O(n²) over a chunk's hits); once a chunk is drained we reset and pull next.
    let cursor = 0
    for (;;) {
      while (cursor < pending.length) {
        // Assemble the batch as a single Buffer (`[h0,h1,…]`) then decode + parse once. Each slice is a
        // complete hit object (`{…}`); interleaving COMMA buffers makes a valid JSON array. This avoids the
        // N intermediate substrings + join that `batch.map(b => b.toString()).join(',')` allocated.
        const parts: Buffer[] = [OPEN]
        let bytes = 0
        while (cursor < pending.length && bytes < BATCH_BYTES) {
          const b = pending[cursor++]
          bytes += b.length
          if (parts.length > 1) parts.push(COMMA)
          parts.push(b)
        }
        parts.push(CLOSE)
        yield JSON.parse(Buffer.concat(parts).toString())
      }
      pending.length = 0
      cursor = 0
      if (ended) return
      await feedNext()
    }
  }

  return {
    hits: hits(),
    async tail () {
      // If the caller reached tail without draining every hit (e.g. an error path), finish the stream.
      // feedNext() is a no-op once ended (iterator stays done, splitter.end() is idempotent).
      for (;;) { pending.length = 0; if (!await feedNext()) break }
      return splitter.envelope()
    }
  }
}
