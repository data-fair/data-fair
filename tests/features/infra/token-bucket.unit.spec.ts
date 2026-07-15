import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { TokenBucket } from '../../../api/src/misc/utils/token-bucket.ts'

// Homegrown replacement for both `limiter` classes (request counting + bandwidth throttling).
// Continuous drip, injectable clock (no sleeps in these tests), starts FULL: the capacity is a
// burst allowance that must be immediately usable.

test.describe('TokenBucket', () => {
  test('starts full: the whole capacity is available immediately', () => {
    const bucket = new TokenBucket(100, 100, 0)
    assert.equal(bucket.tryTake(100, 0), true)
  })

  test('refuses once drained then grants again after a partial refill', () => {
    const bucket = new TokenBucket(100, 100, 0) // 100 tokens/s
    assert.equal(bucket.tryTake(100, 0), true)
    assert.equal(bucket.tryTake(1, 0), false)
    assert.equal(bucket.tryTake(50, 500), true) // 0.5s refilled 50 tokens
    assert.equal(bucket.tryTake(1, 500), false)
  })

  test('refill is capped at capacity', () => {
    const bucket = new TokenBucket(100, 100, 0)
    assert.equal(bucket.tryTake(100, 60000), true) // 60s idle still only holds 100
    assert.equal(bucket.tryTake(1, 60000), false)
  })

  test('a count above capacity is never granted, even when full', () => {
    const bucket = new TokenBucket(100, 100, 0)
    assert.equal(bucket.tryTake(101, 0), false)
    assert.equal(bucket.tryTake(100, 0), true, 'the refusal must not have consumed anything')
  })

  test('a clock going backwards does not corrupt the content', () => {
    const bucket = new TokenBucket(100, 100, 1000)
    assert.equal(bucket.tryTake(100, 1000), true)
    assert.equal(bucket.tryTake(1, 500), false) // earlier timestamp: no negative drip
    assert.equal(bucket.tryTake(50, 1500), true)
  })

  test.describe('msUntil', () => {
    test('0 when the tokens are already available', () => {
      assert.equal(new TokenBucket(100, 100, 0).msUntil(100, 0), 0)
    })

    test('the deficit refill time when they are not', () => {
      const bucket = new TokenBucket(100, 100, 0)
      bucket.tryTake(100, 0)
      assert.equal(bucket.msUntil(50, 0), 500)
      assert.equal(bucket.msUntil(100, 500), 500) // 50 already dripped back
    })

    test('Infinity for a count above capacity', () => {
      assert.equal(new TokenBucket(100, 100, 0).msUntil(101, 0), Infinity)
    })
  })
})
