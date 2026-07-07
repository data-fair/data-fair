import { TokenBucket } from 'limiter'

// Config-free so it can be unit-tested without a config directory (see rate-limiting.unit.spec.ts), same
// as its sibling compute-budget.ts. Consumed by the bandwidth throttle in rate-limiting.ts.

export type TokenBucketWrapper = {
  lastUsed?: number,
  bucketSize: number,
  bucket: TokenBucket
}

// Build the token bucket for a `bandwidth` limit (bytes/s), sized `bandwidth * burstFactor`. Returns
// `undefined` when `bandwidth` is 0 or absent (`apiRate[type].bandwidth[bandwidthType]` is optional — e.g.
// remoteService has no `static`): that means "no bandwidth limit", so callers skip throttling entirely.
// This is the short-circuit that keeps a 0 limit from ever reaching the throttle loop, where a bucketSize
// of 0 would slice into empty chunks and spin forever (and an undefined one would stall on NaN).
export const tokenBucketFor = (bandwidth: number | undefined, burstFactor: number): TokenBucketWrapper | undefined => {
  if (!bandwidth) return undefined
  const bucketSize = bandwidth * burstFactor
  return { bucketSize, lastUsed: Date.now(), bucket: new TokenBucket({ bucketSize, tokensPerInterval: bandwidth, interval: 1000 }) }
}

// Wait until `bucket` grants `count` tokens, resolving `false` early if `signal` fires first (the stream /
// response was torn down mid-wait — drop the slice instead of retaining it for up to one refill window).
// It attaches ONE 'abort' listener and removes it on settle, so a loop calling this per body slice keeps
// at most one live listener on the long-lived close signal. This replaces the previous
// `await Promise.race([bucket.removeTokens(n), closedPromise])`: the race's losing-side reaction on the
// long-lived `closedPromise` was never released until that promise settled, so a throttled send that
// stalled (a client whose per-IP token bucket was saturated) accumulated one retained PromiseReaction
// per slice, unbounded — the production heap leak (millions of retained Promises pinning ServerResponse /
// Socket / Buffer until the pod OOM/GC-spiralled). Returns true when granted, false when aborted first.
export const removeTokensOrAborted = (
  bucket: { removeTokens: (count: number) => Promise<unknown> },
  count: number,
  signal: AbortSignal
): Promise<boolean> => {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const onAbort = () => resolve(false)
    signal.addEventListener('abort', onAbort, { once: true })
    bucket.removeTokens(count).then(
      () => { signal.removeEventListener('abort', onAbort); resolve(true) },
      () => { signal.removeEventListener('abort', onAbort); resolve(false) }
    )
  })
}
