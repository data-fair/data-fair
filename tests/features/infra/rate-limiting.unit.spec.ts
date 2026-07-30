import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { TokenBucket } from '../../../api/src/misc/utils/token-bucket.ts'
import { removeTokensOrAborted, tokenBucketFor, acquireSendSlot, releaseSendSlot, maxPendingSends } from '../../../api/src/misc/utils/throttle-wait.ts'

// removeTokensOrAborted waits for the token bucket to grant `count` tokens, but bails out early if the
// response/stream is torn down (its AbortSignal fires). Two production leaks are pinned here:
// 1. it must not accumulate listeners/reactions on the long-lived close signal across per-slice calls
//    (the `Promise.race([removeTokens, closedPromise])` leak, fixed in #479);
// 2. it must not delegate the wait to `bucket.removeTokens`, whose retry-by-async-recursion builds a
//    retained Promise+PromiseReaction chain per losing retry (378–12798-hop chains observed in a prod
//    heap snapshot under a saturated per-IP bucket), keeps a live timer after the caller aborted, and
//    still consumes tokens when the abandoned call is finally granted — starving live waiters.

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// a bucket that refills completely in `refillMs`; our buckets start FULL, drained=true empties it
const bucketFor = (size: number, refillMs: number, drained = false) => {
  const bucket = new TokenBucket(size, size * 1000 / refillMs)
  if (drained) assert.ok(bucket.tryTake(size), 'drain the bucket')
  return bucket
}

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
    assert.equal(await removeTokensOrAborted(bucketFor(100, 1000), 5, sig as any), true)
  })

  test('waits for the refill then resolves true', async () => {
    const bucket = bucketFor(100, 100, true) // drained, full again after ~100ms
    const sig = countingSignal()
    assert.equal(await removeTokensOrAborted(bucket, 100, sig as any), true)
  })

  test('resolves false promptly when aborted before the tokens are granted', async () => {
    const bucket = bucketFor(100, 60000, true) // drained, one-minute refill: only the abort settles quickly
    const sig = countingSignal()
    const p = removeTokensOrAborted(bucket, 100, sig as any)
    await sleep(20)
    sig.abort()
    assert.equal(await p, false)
  })

  test('resolves false immediately when the signal is already aborted', async () => {
    const sig = countingSignal()
    sig.abort()
    assert.equal(await removeTokensOrAborted(bucketFor(100, 1000), 100, sig as any), false)
  })

  test('resolves false for a count that exceeds the bucket size instead of waiting forever', async () => {
    const sig = countingSignal()
    assert.equal(await removeTokensOrAborted(bucketFor(100, 1000), 101, sig as any), false)
  })

  test('an aborted wait does not consume tokens once the bucket refills (starvation guard)', async () => {
    // bucket refills completely in 500ms; a full-bucket-sized wait computed from the deficit would be
    // granted right at ~500ms. If the abandoned wait is still running under the hood (the old
    // bucket.removeTokens delegation), it steals the whole refill at ~500ms and this tryTake
    // at ~750ms sees a half-empty bucket.
    const bucket = bucketFor(100, 500, true) // drained, full again at ~500ms
    const sig = countingSignal()
    const p = removeTokensOrAborted(bucket, 100, sig as any)
    sig.abort()
    assert.equal(await p, false)
    await sleep(750)
    assert.ok(bucket.tryTake(100), 'the aborted wait must not have consumed the refilled tokens')
  })

  test('an aborted wait leaves no live timer behind (leak guard)', async () => {
    const bucket = bucketFor(100, 60000, true) // drained
    const before = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length
    const sig = countingSignal()
    const p = removeTokensOrAborted(bucket, 100, sig as any)
    sig.abort()
    assert.equal(await p, false)
    const after = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length
    assert.ok(after <= before, `live timers grew from ${before} to ${after} after the abort`)
  })

  test('does not accumulate listeners on the shared signal across many grants (leak guard)', async () => {
    const bucket = bucketFor(1000, 1000)
    const sig = countingSignal()
    for (let i = 0; i < 500; i++) {
      await removeTokensOrAborted(bucket, 1, sig as any)
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

test.describe('send slots', () => {
  // cap on concurrent sends waiting on one bucket: without it a single client saturating its per-IP
  // bandwidth bucket queued ~1400 responses on one bucket in prod, each pinning its full assembled
  // body (714MB of ArrayBuffers in the heap snapshot) until the pod died
  test('acquires up to maxPendingSends slots then refuses', () => {
    const tb = tokenBucketFor(100000, 4)!
    for (let i = 0; i < maxPendingSends; i++) {
      assert.equal(acquireSendSlot(tb), true, `slot ${i} should be granted`)
    }
    assert.equal(acquireSendSlot(tb), false, 'slot beyond the cap should be refused')
  })

  test('released slots can be re-acquired', () => {
    const tb = tokenBucketFor(100000, 4)!
    for (let i = 0; i < maxPendingSends; i++) acquireSendSlot(tb)
    releaseSendSlot(tb)
    assert.equal(acquireSendSlot(tb), true)
    assert.equal(acquireSendSlot(tb), false)
  })

  test('a release without a matching acquire never goes below zero', () => {
    const tb = tokenBucketFor(100000, 4)!
    releaseSendSlot(tb)
    releaseSendSlot(tb)
    for (let i = 0; i < maxPendingSends; i++) {
      assert.equal(acquireSendSlot(tb), true, `slot ${i} should be granted`)
    }
    assert.equal(acquireSendSlot(tb), false)
  })
})
