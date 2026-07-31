import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getCountMode, extrapolateApproxTotal, estimateMarginPct } from '../../../api/src/datasets/es/operations.ts'

const cfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000 }
const bigDataset = { count: 1_000_000 }

test('the default: estimation activates only for ranked q searches on large datasets', () => {
  const mode = getCountMode(bigDataset, { q: 'analyse' }, cfg)
  assert.ok(mode)
  assert.equal(mode.cap, 10000)
  // probability = clamp(100000/1000000, floor 100/10000, 0.5) = 0.1 → randBound 100000
  assert.equal(mode.randBound, 100000)
  assert.equal(mode.probability, 0.1)
})

test('the default stays off for every excluded shape', () => {
  assert.equal(getCountMode(bigDataset, {}, cfg), null) // no q
  assert.equal(getCountMode(bigDataset, { q: '  ' }, cfg), null) // blank q
  assert.equal(getCountMode(bigDataset, { q: 'a', sort: 'field1' }, cfg), null) // explicit sort → not ranked-primary
  assert.equal(getCountMode(bigDataset, { q: 'a', after: '[10]' }, cfg), null)
  assert.equal(getCountMode(bigDataset, { q: 'a', collapse: 'field1' }, cfg), null)
  assert.equal(getCountMode(bigDataset, { q: 'a', count: 'false' }, cfg), null)
  assert.equal(getCountMode(bigDataset, { q: 'a', count: 'exact' }, cfg), null) // escape hatch
  assert.equal(getCountMode({ count: 50000 }, { q: 'a' }, cfg), null) // small dataset
  assert.equal(getCountMode({}, { q: 'a' }, cfg), null) // no count metadata → safe default off
  assert.equal(getCountMode(bigDataset, { q: 'a' }, { ...cfg, minDatasetSize: null }), null) // kill switch
  assert.ok(getCountMode(bigDataset, { _c_q: 'a' }, cfg)) // agent-context q counts as q (commons.ts)
})

test('count=estimate opts any query shape into the same estimation', () => {
  assert.ok(getCountMode(bigDataset, { count: 'estimate' }, cfg)) // no q needed
  assert.ok(getCountMode({ count: 50000 }, { count: 'estimate' }, cfg)) // small dataset allowed
  assert.ok(getCountMode(bigDataset, { q: 'a', sort: 'field1', count: 'estimate' }, cfg)) // sorted allowed
  assert.equal(getCountMode(bigDataset, { count: 'estimate' }, { ...cfg, minDatasetSize: null }), null) // kill switch still wins
  assert.equal(getCountMode({}, { count: 'estimate' }, cfg), null) // no count metadata → off
  assert.equal(getCountMode(bigDataset, { count: 'estimate', after: '[10]' }, cfg), null) // after pages compute no total at all
})

test('probability is adjusted to dataset size and clamped', () => {
  assert.equal(getCountMode({ count: 100000 }, { q: 'a' }, cfg)!.probability, 0.5) // clamp high
  assert.equal(getCountMode({ count: 50_000_000 }, { q: 'a' }, cfg)!.probability, 0.01) // derived floor: 100 samples at the cap boundary
})

test('estimateMarginPct: ~95% half-width, rounded up, clamped to [1, 100]', () => {
  assert.equal(estimateMarginPct(100), 20) // 196/10 = 19.6 → 20
  assert.equal(estimateMarginPct(1000), 7) // 196/31.6 = 6.2 → 7
  assert.equal(estimateMarginPct(14119), 2)
  assert.equal(estimateMarginPct(10_000_000), 1) // never claims better than ±1%
  assert.equal(estimateMarginPct(1), 100)
  assert.equal(estimateMarginPct(0), 100) // degenerate sample → maximal margin
})

test('extrapolation divides by probability and floors at cap+1', () => {
  const mode = { cap: 10000, randBound: 10000, probability: 0.01 }
  assert.equal(extrapolateApproxTotal(8392, mode), 839200)
  assert.equal(extrapolateApproxTotal(3, mode), 10001) // relation was gte, so never report ≤ cap
})
