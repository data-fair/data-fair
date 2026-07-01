import type { Readable } from 'node:stream'
import { createHitSplitter } from './hits-splitter.ts'
import type { LinesSource } from '../routes/lines-source.ts'

// Bridge a raw ES `_search` response stream (the body of an `asStream` request, already gunzipped) into a
// `LinesSource`. The hits-splitter slices the response into: a prefix (through the hits `[`), each hit's
// bytes, and a tail (from the `]`). We pull chunks from the stream on demand and feed the splitter:
//  - BEFORE returning, we pump chunks until the prefix is complete so `total` is known (streamJson writes
//    it in the head before iterating hits). See hits-splitter `total()`.
//  - `hits` is a pull-based async generator: it drains the hits buffered from the last chunk (JSON.parse
//    each), then reads the next chunk and feeds the splitter — so at most one chunk's worth of hits is
//    held in memory at a time (never the whole result set). Backpressure is natural: no chunk is read
//    until the consumer pulls the next hit.
//  - `tail()` finishes consuming the stream (if not already) and returns the whole envelope skeleton
//    (`{ total, _shards, aggregations, … }` with an empty `hits.hits`) via `JSON.parse` of prefix+tail.
//
// This module is intentionally free of any `#config` import so it can be unit-tested against a synthetic
// `Readable` without a config directory (see search-stream.unit.spec.ts).
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
    for (;;) {
      while (pending.length) yield JSON.parse((pending.shift() as Buffer).toString())
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
