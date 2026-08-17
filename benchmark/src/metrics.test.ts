import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate } from './metrics.ts'

test('aggregate computes stats for an even-length sample', () => {
  const a = aggregate([4, 1, 3, 2])
  assert.equal(a.min, 1)
  assert.equal(a.max, 4)
  assert.equal(a.median, 2.5)
  assert.equal(a.mean, 2.5)
})

test('aggregate computes the median for an odd-length sample', () => {
  assert.equal(aggregate([5, 1, 3]).median, 3)
})

test('aggregate of a single sample has zero stddev', () => {
  const a = aggregate([7])
  assert.equal(a.median, 7)
  assert.equal(a.stddev, 0)
})

test('aggregate throws on empty input', () => {
  assert.throws(() => aggregate([]), /empty/)
})
