import { test } from 'node:test'
import assert from 'node:assert/strict'
import { p95, framesP95 } from './collect.ts'

test('p95 of 20 values is the 19th smallest', () => {
  assert.equal(p95(Array.from({ length: 20 }, (_, i) => i + 1)), 19)
})

test('p95 of an empty list is 0', () => {
  assert.equal(p95([]), 0)
})

test('framesP95 only uses frames inside the span', () => {
  // 16ms frames, then one 100ms frame outside the span
  const ts = [0, 16, 32, 48, 64, 164]
  assert.equal(framesP95(ts, 0, 64), 16)
  assert.equal(framesP95(ts, 0, 200), 100)
})

test('framesP95 with fewer than two frames is 0', () => {
  assert.equal(framesP95([10], 0, 100), 0)
})
