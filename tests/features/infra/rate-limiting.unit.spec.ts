import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { TokenBucket } from '../../../api/src/misc/utils/token-bucket.ts'
import { removeTokensOrAborted, tokenBucketFor, acquireSendSlot, releaseSendSlot, maxPendingSends, writeParts, throttledSendParts } from '../../../api/src/misc/utils/throttle-wait.ts'

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

// A hand-rolled PartsSink double: `full` makes write() report backpressure (return false), drain()
// releases it. Deterministic — no reliance on real socket buffers.
const fakeSink = () => {
  const emitter = new EventEmitter()
  return {
    written: [] as Buffer[],
    destroyed: false,
    writableEnded: false,
    full: false,
    writableLength: undefined as number | undefined,
    write (chunk: Buffer) { this.written.push(chunk); return !this.full },
    once (ev: string, fn: () => void) { return emitter.once(ev, fn) },
    off (ev: string, fn: () => void) { return emitter.off(ev, fn) },
    drain () { emitter.emit('drain') },
    get drainListeners () { return emitter.listenerCount('drain') }
  }
}

const tick = () => new Promise(resolve => setImmediate(resolve))
const parts3 = () => [Buffer.from('part-one'), Buffer.from('part-two'), Buffer.from('part-three')]

// writeParts is the sequential-write half of the /lines partial-writes design: the response body is
// sent as its accumulated parts (no final Buffer.concat) under backpressure, and the parts array is
// consumed as it goes so already-sent parts become collectable DURING the send — the whole point.
test.describe('writeParts', () => {
  test('writes every part in order, consumes the array, resolves true', async () => {
    const sink = fakeSink()
    const parts = parts3()
    const sig = countingSignal()
    assert.equal(await writeParts(sink as any, parts, sig as any), true)
    assert.equal(Buffer.concat(sink.written).toString(), 'part-onepart-twopart-three')
    assert.equal(parts.length, 0, 'the array must be consumed (progressive release)')
    assert.equal(sig.liveListeners, 0, 'no abort-listener residue')
  })

  test('honors backpressure: waits for drain between parts and releases them one by one', async () => {
    const sink = fakeSink()
    sink.full = true // every write reports a full socket buffer
    const parts = parts3()
    const sig = countingSignal()
    const done = writeParts(sink as any, parts, sig as any)

    await tick()
    assert.equal(sink.written.length, 1, 'only one part may be in flight before the first drain')
    assert.equal(parts.length, 3, 'nothing released yet — the write is not accepted')

    sink.drain()
    await tick()
    assert.equal(sink.written.length, 2)
    assert.equal(parts.length, 2, 'the accepted part must be released for collection')

    sink.drain()
    await tick()
    sink.drain()
    await tick()
    assert.equal(await done, true)
    assert.equal(Buffer.concat(sink.written).toString(), 'part-onepart-twopart-three')
    assert.equal(parts.length, 0)
    assert.equal(sink.drainListeners, 0, 'no drain-listener residue')
  })

  test('stops on abort while waiting for drain (client gone): resolves false, drops the tail', async () => {
    const sink = fakeSink()
    sink.full = true
    const parts = parts3()
    const sig = countingSignal()
    const done = writeParts(sink as any, parts, sig as any)
    await tick()
    sig.abort()
    assert.equal(await done, false, 'caller must not end() the response')
    assert.ok(parts.length > 0, 'the tail is dropped, not written')
    assert.equal(sink.written.length, 1)
    assert.equal(sink.drainListeners, 0, 'the drain listener must be cleaned up on abort')
  })

  test('resolves false immediately on an already-destroyed sink', async () => {
    const sink = fakeSink()
    sink.destroyed = true
    const sig = countingSignal()
    assert.equal(await writeParts(sink as any, parts3(), sig as any), false)
    assert.equal(sink.written.length, 0)
  })

  test('soft cap: a small buffered amount does not park on drain even when write() reports full', async () => {
    // real responses expose writableLength; waiting for drain on EVERY refused 64KB write would
    // lockstep the send to one event-loop round trip per part — below the ~1MB cap the loop keeps going
    const sink = fakeSink()
    sink.full = true
    sink.writableLength = 1024 // far below the cap → never wait
    const parts = parts3()
    const sig = countingSignal()
    assert.equal(await writeParts(sink as any, parts, sig as any), true, 'must complete without any drain event')
    assert.equal(Buffer.concat(sink.written).toString(), 'part-onepart-twopart-three')
    assert.equal(parts.length, 0)
  })
})

// throttledSendParts drips the same parts under the bandwidth token bucket — plain res.write calls
// would bypass the bucket entirely (a bandwidth-limit bypass), so the parity gate here is that a
// multi-part body still takes at least the bucket-implied duration.
test.describe('throttledSendParts', () => {
  test('enforces the bandwidth limit across parts and preserves byte order', async () => {
    // 20KB/s, burst 1 → bucket starts full with 20KB: a 30KB body must wait ~500ms for the last 10KB
    const tb = tokenBucketFor(20000, 1)!
    const parts = [Buffer.alloc(15000, 1), Buffer.alloc(10000, 2), Buffer.alloc(5000, 3)]
    const expected = Buffer.concat(parts)
    const written: Buffer[] = []
    const sig = countingSignal()
    const t0 = Date.now()
    const sent = await throttledSendParts(tb, slice => { written.push(slice) }, parts, sig as any)
    const elapsed = Date.now() - t0
    assert.equal(sent, true)
    assert.ok(Buffer.concat(written).equals(expected), 'bytes must be identical and in order')
    assert.equal(parts.length, 0, 'parts are consumed as they are sent')
    assert.ok(elapsed > 350, `a 30KB body over a 20KB burst + 20KB/s bucket should take ~500ms, took ${elapsed}ms`)
  })

  test('stops on abort mid-send: resolves false, keeps the unsent tail unconsumed', async () => {
    const tb = tokenBucketFor(1000, 1)!
    assert.ok(tb.bucket.tryTake(1000), 'drain the bucket so the send has to wait')
    const parts = [Buffer.alloc(500, 1), Buffer.alloc(500, 2)]
    const written: Buffer[] = []
    const sig = countingSignal()
    const done = throttledSendParts(tb, slice => { written.push(slice) }, parts, sig as any)
    await sleep(20)
    sig.abort()
    assert.equal(await done, false)
    assert.equal(written.length, 0, 'nothing was granted before the abort')
    assert.equal(parts.length, 2)
  })

  test('awaits an async write (backpressure) before requesting the next slice tokens', async () => {
    const tb = tokenBucketFor(100000, 4)!
    const order: string[] = []
    const sig = countingSignal()
    const write = async (slice: Buffer) => {
      order.push(`start-${slice.length}`)
      await sleep(10)
      order.push(`end-${slice.length}`)
    }
    assert.equal(await throttledSendParts(tb, write, [Buffer.alloc(10, 1), Buffer.alloc(20, 2)], sig as any), true)
    assert.deepEqual(order, ['start-10', 'end-10', 'start-20', 'end-20'], 'writes must be strictly sequential')
  })
})
