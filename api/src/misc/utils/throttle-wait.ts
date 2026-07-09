import { TokenBucket } from './token-bucket.ts'

// Config-free so it can be unit-tested without a config directory (see rate-limiting.unit.spec.ts), same
// as its siblings compute-budget.ts and token-bucket.ts. Consumed by the bandwidth throttle in
// rate-limiting.ts.

export type TokenBucketWrapper = {
  lastUsed: number,
  bucketSize: number,
  bucket: TokenBucket,
  pendingSends: number
}

// Cap on concurrent sends waiting on ONE bucket (i.e. per client × bandwidth type). Without it a single
// client saturating its per-IP bandwidth bucket queued ~1400 responses on one bucket in prod, each
// pinning its full assembled body until the pod OOMed (714MB of ArrayBuffers in the heap snapshot).
// Sends beyond the cap are torn down by the callers in rate-limiting.ts. Generous on purpose: a normal
// browser/integration keeps a handful of connections; only a flood ever queues this deep.
// NOTE: since the backpressured send loops (below) a slot is held for the CLIENT-paced duration of the
// send, not just the token pacing — each pending send now pins only ~maxBufferedBytes instead of its
// full body, which is the trade this cap exists to arbitrate; stalled sockets are reaped by the
// reverse proxy's send timeout ('close' → abort → slot release).
export const maxPendingSends = 100

export const acquireSendSlot = (wrapper: TokenBucketWrapper): boolean => {
  if (wrapper.pendingSends >= maxPendingSends) return false
  wrapper.pendingSends++
  return true
}

export const releaseSendSlot = (wrapper: TokenBucketWrapper): void => {
  wrapper.pendingSends = Math.max(0, wrapper.pendingSends - 1)
}

// Build the token bucket for a `bandwidth` limit (bytes/s), sized `bandwidth * burstFactor`. Returns
// `undefined` when `bandwidth` is 0 or absent (`apiRate[type].bandwidth[bandwidthType]` is optional — e.g.
// remoteService has no `static`): that means "no bandwidth limit", so callers skip throttling entirely.
// This is the short-circuit that keeps a 0 limit from ever reaching the throttle loop, where a bucketSize
// of 0 would slice into empty chunks and spin forever.
export const tokenBucketFor = (bandwidth: number | undefined, burstFactor: number): TokenBucketWrapper | undefined => {
  if (!bandwidth) return undefined
  const bucketSize = bandwidth * burstFactor
  return { bucketSize, lastUsed: Date.now(), pendingSends: 0, bucket: new TokenBucket(bucketSize, bandwidth) }
}

// floor on the retry sleep: when many waiters compete for the same bucket the computed deficit can be
// ~0 right after a rival wins the refill — without a floor the losers would busy-spin on the event loop
const minRetryWaitMs = 50

// sleep that settles early (and clears its timer) when `signal` fires; one listener, removed on settle
const abortableSleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise<void>((resolve) => {
  const onAbort = () => { clearTimeout(timer); resolve() }
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
  signal.addEventListener('abort', onAbort, { once: true })
})

// Wait until `bucket` grants `count` tokens, resolving `false` early if `signal` fires first (the stream /
// response was torn down mid-wait — drop the slice instead of retaining it for up to one refill window).
// A flat poll loop on purpose — this replaced the `limiter` lib's removeTokens, whose retry by AWAITED
// RECURSION added a retained Promise+PromiseReaction level per losing retry (chains up to ~12k hops,
// millions of retained promises in prod under a saturated per-IP bucket) and whose abandoned calls kept
// running after abort, still consuming their tokens when granted. Here each iteration's promises settle
// before the next (O(1) retained memory per waiter), at most one live timer and one abort listener exist
// at a time, and an aborted waiter never consumes tokens. Returns true when granted, false when aborted
// first (or when `count` can never fit the bucket).
export const removeTokensOrAborted = async (
  bucket: Pick<TokenBucket, 'tryTake' | 'msUntil'>,
  count: number,
  signal: AbortSignal
): Promise<boolean> => {
  while (true) {
    if (signal.aborted) return false
    if (bucket.tryTake(count)) return true
    // time for the deficit to drip in, recomputed each round because rival waiters may win the refill
    const waitMs = bucket.msUntil(count)
    if (waitMs === Infinity) return false // can never fit the bucket
    await abortableSleep(Math.max(waitMs, minRetryWaitMs), signal)
  }
}

// The writable surface the sequential-write loops below need — an Express Response in production, any
// Writable (or a hand-rolled double) in unit tests.
export interface PartsSink {
  write: (chunk: Buffer) => boolean
  once: (event: string, listener: () => void) => unknown
  off: (event: string, listener: () => void) => unknown
  destroyed?: boolean
  writableEnded?: boolean
  writableLength?: number
}

// Resolve when the sink drains — or when `signal` fires first (response torn down mid-send: 'drain'
// may then never come). One listener each, both removed on settle, so a long multi-part send never
// accumulates listeners on the shared close signal.
const drainOrAborted = (sink: PartsSink, signal: AbortSignal): Promise<void> => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve()
  const settle = () => {
    sink.off('drain', settle)
    signal.removeEventListener('abort', settle)
    resolve()
  }
  sink.once('drain', settle)
  signal.addEventListener('abort', settle)
})

// Waiting for 'drain' after EVERY refused write() would lockstep the send to one event-loop round trip
// per ~64KB part — on a laggy loop that dominates large unthrottled sends. Instead let Node buffer up
// to this many bytes before parking on 'drain': bounded per-response buffering (vs the pre-split
// behavior of queueing the WHOLE body), ~16x fewer drain waits. Sinks that don't expose
// writableLength (unit-test doubles) keep strict per-write waits.
const maxBufferedBytes = 1024 * 1024

// Write one chunk honoring backpressure: when the socket buffer is full past maxBufferedBytes, wait for
// 'drain' before returning so callers keep a bounded amount queued in Node's outgoing buffer (this is
// what lets already-sent parts become collectable DURING the send instead of pinning the whole body).
// No-op once the response is gone.
export const writeWithBackpressure = async (sink: PartsSink, chunk: Buffer, signal: AbortSignal): Promise<void> => {
  if (signal.aborted || sink.destroyed || sink.writableEnded) return
  if (!sink.write(chunk) && (sink.writableLength ?? Infinity) >= maxBufferedBytes) await drainOrAborted(sink, signal)
}

// Sequentially write `parts` (unthrottled), consuming the array as it goes — parts.shift() after each
// write releases the caller's last reference so sent bytes are collectable while the tail is still being
// sent. Returns true when everything was written and the response is still alive (caller may end it),
// false on abort/teardown (caller must NOT end).
export const writeParts = async (sink: PartsSink, parts: Buffer[], signal: AbortSignal): Promise<boolean> => {
  while (parts.length) {
    if (signal.aborted || sink.destroyed || sink.writableEnded) return false
    await writeWithBackpressure(sink, parts[0], signal)
    parts.shift()
  }
  return !signal.aborted && !sink.destroyed && !sink.writableEnded
}

// The slice/wait/write loop shared by the bandwidth Throttle stream and the wrapped res.end path (see
// rate-limiting.ts). Waits for bandwidth tokens per slice and resolves false when the request is torn
// down mid-wait (abort) — the caller just stops, dropping the rest of the buffer. `write` may be async
// (backpressure-aware): the next slice's tokens are only requested once the previous one is accepted.
export const throttledSend = async (tokenBucket: TokenBucketWrapper, write: (slice: Buffer) => void | Promise<void>, buffer: Buffer, signal: AbortSignal): Promise<boolean> => {
  let pos = 0
  while (pos < buffer.length) {
    if (signal.aborted) return false
    const slice = buffer.subarray(pos, pos + tokenBucket.bucketSize)
    if (!await removeTokensOrAborted(tokenBucket.bucket, slice.length, signal)) return false
    await write(slice)
    pos += slice.length
  }
  return true
}

// throttledSend over an array of parts, consuming it as it goes (same progressive release as
// writeParts). lastUsed is touched per part so the sweep never drops the bucket under a long throttled
// send (mirrors the Throttle stream's per-chunk touch). Returns false when aborted mid-send.
export const throttledSendParts = async (tokenBucket: TokenBucketWrapper, write: (slice: Buffer) => void | Promise<void>, parts: Buffer[], signal: AbortSignal): Promise<boolean> => {
  while (parts.length) {
    tokenBucket.lastUsed = Date.now()
    if (!await throttledSend(tokenBucket, write, parts[0], signal)) return false
    parts.shift()
  }
  return true
}
