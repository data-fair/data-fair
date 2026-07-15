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
