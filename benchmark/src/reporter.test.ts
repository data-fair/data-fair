import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pctDelta, sameHits } from './reporter.ts'
import type { RunResult } from './runner.ts'

test('pctDelta computes signed percentage change', () => {
  assert.equal(pctDelta(100, 50), -50)
  assert.equal(pctDelta(100, 150), 50)
  assert.equal(pctDelta(0, 0), 0)
})

test('sameHits compares top hit ids, ignoring the total', () => {
  const base = { topHitIds: ['a', 'b'], totalValue: 999, totalRelation: 'eq' } as RunResult
  const same = { topHitIds: ['a', 'b'], totalValue: 10, totalRelation: 'gte' } as RunResult
  const diff = { topHitIds: ['a', 'c'], totalValue: 999, totalRelation: 'eq' } as RunResult
  assert.equal(sameHits(base, same), true)
  assert.equal(sameHits(base, diff), false)
})
