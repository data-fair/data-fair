import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getApproxCountMode, extrapolateApproxTotal } from '../../../api/src/datasets/es/operations.ts'

const cfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000, minProbability: 0.01 }
const bigDataset = { count: 1_000_000 }

test('approx mode activates only for ranked q searches on large datasets', () => {
  const mode = getApproxCountMode(bigDataset, { q: 'analyse' }, cfg)
  assert.ok(mode)
  assert.equal(mode.cap, 10000)
  // probability = clamp(100000/1000000, 0.01, 0.5) = 0.1 → randBound 100000
  assert.equal(mode.randBound, 100000)
  assert.equal(mode.probability, 0.1)
})

test('approx mode stays off for every excluded shape', () => {
  assert.equal(getApproxCountMode(bigDataset, {}, cfg), null) // no q
  assert.equal(getApproxCountMode(bigDataset, { q: '  ' }, cfg), null) // blank q
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', sort: 'field1' }, cfg), null) // explicit sort → not ranked-primary
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', after: '[10]' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', collapse: 'field1' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'false' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'estimate' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'exact' }, cfg), null) // escape hatch
  assert.equal(getApproxCountMode({ count: 50000 }, { q: 'a' }, cfg), null) // small dataset
  assert.equal(getApproxCountMode({}, { q: 'a' }, cfg), null) // no count metadata → safe default off
  assert.equal(getApproxCountMode(bigDataset, { q: 'a' }, { ...cfg, minDatasetSize: null }), null) // kill switch
  assert.ok(getApproxCountMode(bigDataset, { _c_q: 'a' }, cfg)) // agent-context q counts as q (commons.ts)
})

test('probability is adjusted to dataset size and clamped', () => {
  assert.equal(getApproxCountMode({ count: 100000 }, { q: 'a' }, cfg)!.probability, 0.5) // clamp high
  assert.equal(getApproxCountMode({ count: 50_000_000 }, { q: 'a' }, cfg)!.probability, 0.01) // clamp low
})

test('extrapolation divides by probability and floors at cap+1', () => {
  const mode = { cap: 10000, randBound: 10000, probability: 0.01 }
  assert.equal(extrapolateApproxTotal(8392, mode), 839200)
  assert.equal(extrapolateApproxTotal(3, mode), 10001) // relation was gte, so never report ≤ cap
})
