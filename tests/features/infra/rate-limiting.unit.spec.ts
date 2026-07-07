import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { removeTokensOrAborted, tokenBucketFor } from '../../../api/src/misc/utils/throttle-wait.ts'

// removeTokensOrAborted waits for the token bucket to grant `count` tokens, but bails out early if the
// response/stream is torn down (its AbortSignal fires). It must attach at most ONE 'abort' listener per
// call and remove it on settle — a loop calling it per body slice must NOT accumulate listeners/reactions
// on the long-lived close signal (that accumulation was the production heap leak: millions of retained
// PromiseReactions from `Promise.race([removeTokens, closedPromise])` in a per-slice loop).

// bucket doubles (structural: only removeTokens is used)
const grantingBucket = () => ({ removeTokens: async (_n: number) => 0 })
const neverBucket = () => ({ removeTokens: (_n: number) => new Promise<number>(() => {}) })

// AbortSignal double that exposes its live-listener count so we can assert non-accumulation
function countingSignal () {
  const listeners = new Set<() => void>()
  let aborted = false
  return {
    get aborted () { return aborted },
    addEventListener (_type: string, fn: () => void) { listeners.add(fn) },
    removeEventListener (_type: string, fn: () => void) { listeners.delete(fn) },
    get liveListeners () { return listeners.size },
    abort () { aborted = true; for (const fn of [...listeners]) { listeners.delete(fn); fn() } }
  }
}

test.describe('removeTokensOrAborted', () => {
  test('resolves true when the bucket grants the tokens', async () => {
    const sig = countingSignal()
    assert.equal(await removeTokensOrAborted(grantingBucket() as any, 5, sig as any), true)
  })

  test('resolves false promptly when aborted before the tokens are granted', async () => {
    const sig = countingSignal()
    const p = removeTokensOrAborted(neverBucket() as any, 5, sig as any)
    sig.abort()
    assert.equal(await p, false)
  })

  test('resolves false immediately when the signal is already aborted', async () => {
    const sig = countingSignal()
    sig.abort()
    assert.equal(await removeTokensOrAborted(neverBucket() as any, 5, sig as any), false)
  })

  test('does not accumulate listeners on the shared signal across many grants (leak guard)', async () => {
    const sig = countingSignal()
    for (let i = 0; i < 500; i++) {
      await removeTokensOrAborted(grantingBucket() as any, 1, sig as any)
      assert.ok(sig.liveListeners <= 1, `iteration ${i}: ${sig.liveListeners} live listeners`)
    }
    assert.equal(sig.liveListeners, 0, 'no listener residue after the loop')
  })
})

test.describe('tokenBucketFor', () => {
  // a 0 or absent bandwidth limit means "no throttling" — the short-circuit that keeps a degenerate bucket
  // (bucketSize 0 → empty slices → infinite loop; undefined → NaN stall) from ever reaching the throttle loop
  test('returns undefined for a 0 bandwidth limit (throttling disabled)', () => {
    assert.equal(tokenBucketFor(0, 4), undefined)
  })

  test('returns undefined for an absent (undefined) bandwidth limit', () => {
    assert.equal(tokenBucketFor(undefined, 4), undefined)
  })

  test('builds a bucket sized bandwidth * burstFactor for a real limit', () => {
    const tb = tokenBucketFor(100000, 4)
    assert.ok(tb)
    assert.equal(tb.bucketSize, 400000)
  })
})
