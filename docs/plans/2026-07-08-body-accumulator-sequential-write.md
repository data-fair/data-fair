# Direction: sequential-write /lines body (drop the final Buffer.concat)

Status: **direction agreed, not implemented** (2026-07-08). Follow-up to the event-loop stall fixes
(`2026-07-08-event-loop-stall-fixes.md`); do this as its own PR with its own parity tests.

## Problem

`BodyAccumulator.finish()` (`api/src/datasets/routes/lines-body.ts`) ends with
`Buffer.concat([prefixBuf, ...parts, suffixBuf])`:

- **2× body transient external memory**: at the instant of concat, the ~64KB parts (~1× body) and the
  new contiguous buffer (~1× body) are both live. The concat result is an unpooled exact-size
  allocation — for large exports this is the "transient assemble-then-send body/Buffer" spike the prod
  heap profile identified (~1.2GB external).
- **1× body pinned for the whole send**: `sendPrepared` → `res.send(buffer)` → `res.end(buffer)`, and
  the bandwidth throttler (`rate-limiting.ts` `res.throttleEnd`) works by overriding `res.end(buffer)`
  and dripping that single buffer out under the token bucket. A slow-client 200MB export pins 200MB for
  the entire throttled send.
- **O(body) sync memcpy** (~5–10ms per 100MB) — minor next to the memory effects.

## Why the concat is not required

The assemble-then-send contract (ETag, Content-Length, `Link: next` before the first byte) needs the
body **fully determined**, not **contiguous**. At `finish()` time everything is known without
concatenation: the sha1 was fed incrementally per part, Content-Length is the sum of part lengths, Link
is set before send. Node's socket layer writevs an array of buffers without merging them.

This does NOT contradict the "stream the HTTP response — Rejected" entry in
`docs/architecture/read-lines-efficiency.md`: that rejection was about streaming *while consuming ES*
(headers before the body is known). Writing the parts sequentially *after* assembly keeps every header
byte-identical — it refines the decision, don't re-litigate it, extend the doc's record.

## Design

`finish()` returns `{ parts: Buffer[], length: number, etag: string }` (no concat). A new
`sendPreparedParts(req, res, parts, length, etag)` replaces `sendPrepared` for json/csv/geojson and
must reproduce, byte-for-byte and semantics-for-semantics, what `res.send(buffer)` did:

1. `Content-Type` charset suffix (as today in `sendPrepared`).
2. `ETag` set, then **`req.fresh` → `res.status(304).end()`** with no body (this check lives inside
   `res.send` today — it must not be lost).
3. **HEAD** requests: headers only, no body.
4. **`Content-Length` set explicitly** = total length (otherwise Node switches to chunked transfer
   encoding — an observable header change).
5. **Throttling integration — the critical piece**: `res.throttleEnd` only intercepts `res.end(buffer)`;
   plain `res.write(part)` calls would bypass the token bucket entirely (a bandwidth-limit bypass).
   Extend `throttledEnd` (`api/src/misc/utils/rate-limiting.ts`) to accept `Buffer[]` (drip part by
   part under the same bucket), or pipe the parts through the existing `res.throttle()` Transform used
   by raw-download routes. Keep the `acquireSendSlot` queue-full → `res.destroy()` behavior.
6. **Backpressure + progressive release**: await `drain` when `res.write` returns false, and
   `parts.shift()` after each write so sent parts become collectable — memory *decreases* during the
   send instead of pinning 1× body (the actual prize, bigger than removing the copy).
7. Client-abort during the write loop: stop writing, release the send slot, no unhandled rejection
   (mirror `throttledEnd`'s current error handling).

## What must not change (parity gates for the PR)

- Identical headers on 200s: Content-Type (charset), Content-Length, ETag value (same incremental sha1
  scheme — untouched), Link, status.
- Identical 304 behavior on `If-None-Match`, identical HEAD behavior.
- Bandwidth limits still enforced (test with a tiny token bucket: measure that a multi-part body takes
  ≥ the bucket-implied duration; and that the queue-full path still destroys).
- Body bytes identical (trivially true — same parts in order).
- RSS/external: add a micro-bench or an observer assertion that peak external during a large export
  drops (~2× → ~1× decreasing); `benchmark/src/micro/stall-audit.bench.ts` shows the bench pattern.

## Touch points

- `api/src/datasets/routes/lines-body.ts` — `BodyAccumulator.finish()` (keep a `buffer`-returning
  variant only if unit specs need it; `buildJsonBody`/`buildGeojsonBody` are test-side references,
  untouched).
- `api/src/datasets/routes/lines-pipeline.ts` — `sendPrepared` → `sendPreparedParts`, three call sites
  (streamJson / streamCsv / streamGeojson).
- `api/src/misc/utils/rate-limiting.ts` — `throttledEnd` learns `Buffer[]` (or Transform piping).
- Tests: extend `tests/features/infra/lines-stream-parity.unit.spec.ts` pattern; api specs asserting
  ETag/304/Link already exist and must stay green; add a throttled-send api test if none covers it.
- Docs: update `docs/architecture/read-lines-efficiency.md` (the BodyAccumulator paragraph + rejected
  table note explaining why sequential-after-assembly is not the rejected "stream the response").

## Non-goals

- No change to how the body is *produced* (consumeHits bulks, yields, incremental sha1 — all stay).
- No streaming-while-consuming revival.
- The zero-copy worker formats (wkt/xlsx/shp/tiles) are separate paths and out of scope — though the
  same "drip an array" throttler extension may later serve the sheet/wkt buffers too.
