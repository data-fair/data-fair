import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ComputeBucket } from '../../../api/src/misc/utils/compute-budget.ts'

// time-weighted ("compute budget") rate limiting bucket: holds N ms of allowed work per window,
// refills continuously, may go negative (floored at -budgetMs) so an over-budget request imposes a cool-down
test.describe('ComputeBucket', () => {
  test('starts full — budget available right away', () => {
    const b = new ComputeBucket(1000, 1000, 0)
    assert.equal(b.hasBudget(0), true)
  })

  test('debiting exactly the budget empties it (an empty bucket is not "available")', () => {
    const b = new ComputeBucket(1000, 1000, 0)
    b.debit(1000, 0)
    assert.equal(b.content, 0)
    assert.equal(b.hasBudget(0), false)
  })

  test('debiting more than the budget pushes content negative, floored at -budgetMs', () => {
    const b = new ComputeBucket(1000, 1000, 0)
    b.debit(5000, 0)
    assert.equal(b.content, -1000)
    assert.equal(b.hasBudget(0), false)
  })

  test('refills continuously at budgetMs per windowMs', () => {
    // 1000 ms of budget per 10000 ms window => 0.1 ms refilled per elapsed ms
    const b = new ComputeBucket(1000, 10000, 0)
    b.debit(1000, 0)
    assert.equal(b.hasBudget(0), false)
    assert.equal(b.hasBudget(1), true) // +0.1 after 1 ms is enough to be > 0
  })

  test('content never exceeds budgetMs no matter how long it has been idle', () => {
    const b = new ComputeBucket(1000, 1000, 0)
    assert.equal(b.hasBudget(1_000_000), true)
    assert.equal(b.content, 1000)
  })

  test('a fully negative bucket recovers to available within one window', () => {
    // refill 1 ms per ms
    const b = new ComputeBucket(1000, 1000, 0)
    b.debit(2000, 0)
    assert.equal(b.content, -1000)
    assert.equal(b.hasBudget(1000), false) // -1000 + 1000 = 0, still not > 0
    assert.equal(b.hasBudget(1001), true) // -1000 + 1001 = 1 > 0
  })

  test('a negative ms debit is ignored (clamped to 0)', () => {
    const b = new ComputeBucket(1000, 1000, 0)
    b.debit(-50, 0)
    assert.equal(b.content, 1000)
  })
})
