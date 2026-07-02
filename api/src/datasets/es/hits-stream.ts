import type { Readable } from 'node:stream'
import { createHitSplitter } from './hits-splitter.ts'
import type { LinesSource } from '../routes/lines-source.ts'

// Bridge a raw ES `_search` response stream (the body of an `asStream` request, already gunzipped) into a
// `LinesSource`. The hits-splitter slices the response into: a prefix (through the hits `[`), each hit's
// bytes, and a tail (from the `]`). We pull chunks from the stream on demand and feed the splitter:
//  - BEFORE returning, we pump chunks until the prefix is complete so `total` is known (streamJson writes
//    it in the head before iterating hits). See hits-splitter `total()`.
//  - `hits` is a pull-based async generator: it drains the hits buffered from the last chunk in
//    ~BATCH_BYTES groups (one JSON.parse per group), then reads the next chunk and feeds the splitter — so
//    at most one chunk's worth of hits is held in memory at a time (never the whole result set).
//    Backpressure is natural: no chunk is read until the consumer pulls the next hit.
//  - `tail()` finishes consuming the stream (if not already) and returns the whole envelope skeleton
//    (`{ total, _shards, aggregations, … }` with an empty `hits.hits`) via `JSON.parse` of prefix+tail.
//
// This module is intentionally free of any `#config` import so it can be unit-tested against a synthetic
// `Readable` without a config directory (see search-stream.unit.spec.ts).
// Byte-adaptive parse batching: accumulate complete hit slices until their combined size reaches this,
// then JSON.parse them as a single array. Amortizes per-parse-call overhead (CPU is flat from ~4KB to
// ~100KB and degrades beyond ~256KB per the threshold sweep) while keeping peak bounded — fat rows
// collapse to one hit per batch, skinny rows pack many. See benchmark/results/streaming-threshold-sweep.md.
const BATCH_BYTES = 20 * 1024

// Mode decision, kept config-free so it is unit-testable in isolation. `content-length` reflects the real
// decompressed size only when the body is NOT gzip-compressed (the ES client requests identity by default);
// when gzip-encoded or absent (chunked transfer) the decompressed size is unknown, so we stream — the safe
// default, since an unexpectedly large buffered response is exactly the memory blow-up streaming prevents.
export function chooseStreamMode (headers: any, gzip: boolean, opts: { minBytes: number, forceStream?: boolean }): 'streamed' | 'buffered' {
  if (opts.forceStream) return 'streamed'
  const contentLength = Number(headers?.['content-length'])
  const knownSize = !gzip && Number.isFinite(contentLength)
  return (knownSize && contentLength < opts.minBytes) ? 'buffered' : 'streamed'
}

// Collect a (small) identity-encoded ES `_search` body and parse it into the same object shape the buffered
// `search()` returns. JSON.parse matches the streamed hits path (which parses the same user-field hits with
// JSON.parse); the flag-off buffered path keeps the ES client's secure-json-parse via `search()`.
export async function collectResponse (decoded: Readable): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of decoded) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString())
}

export async function streamToSource (stream: Readable): Promise<LinesSource> {
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

  // Pump until the hits-array prefix is captured (total known) or the stream ends (defensive: a response
  // without a hits array — total stays undefined). feedNext() returns false once the stream is exhausted.
  while (splitter.total() === undefined) {
    if (!await feedNext()) break
  }
  const total = splitter.total()

  async function * hits () {
    // Yields BULKS (each ~BATCH_BYTES of hits parsed with a single JSON.parse): fewer async-generator
    // steps than per-hit, and the consumer serializes a whole bulk per write. `cursor` walks the buffered
    // slices without Array.shift (O(n²) over a chunk's hits); once a chunk is drained we reset and pull next.
    let cursor = 0
    for (;;) {
      while (cursor < pending.length) {
        let bytes = 0
        const batch: Buffer[] = []
        while (cursor < pending.length && bytes < BATCH_BYTES) {
          const b = pending[cursor++]
          bytes += b.length
          batch.push(b)
        }
        // each slice is a complete hit object (`{…}`), so joining with commas yields a valid JSON array.
        yield JSON.parse('[' + batch.map(b => b.toString()).join(',') + ']')
      }
      pending.length = 0
      cursor = 0
      if (ended) return
      await feedNext()
    }
  }

  return {
    total,
    hits: hits(),
    async tail () {
      // If the caller reached tail without draining every hit (e.g. an error path), finish the stream.
      // feedNext() is a no-op once ended (iterator stays done, splitter.end() is idempotent).
      for (;;) { pending.length = 0; if (!await feedNext()) break }
      return splitter.envelope()
    }
  }
}
