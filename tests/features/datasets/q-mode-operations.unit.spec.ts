import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseQMode, parseQRequired, chooseStrictestCandidate } from '../../../api/src/datasets/es/operations.ts'

test('parseQMode accepts the legacy and new modes', () => {
  assert.equal(parseQMode(undefined, 'simple'), 'simple')
  assert.equal(parseQMode(undefined, 'adapt'), 'adapt')
  assert.equal(parseQMode('or', 'simple'), 'simple') // alias
  assert.equal(parseQMode('simple', 'adapt'), 'simple')
  assert.equal(parseQMode('complete', 'simple'), 'complete')
  assert.equal(parseQMode('and', 'simple'), 'and')
  assert.equal(parseQMode('adapt', 'simple'), 'adapt')
  assert.throws(() => parseQMode('3', 'simple')) // numeric msm deliberately not supported
  assert.throws(() => parseQMode('bogus', 'simple'))
})

test('parseQRequired accepts only whitespace tokens of q', () => {
  assert.deepEqual(parseQRequired('commun rare', 'rare'), ['rare'])
  assert.deepEqual(parseQRequired('commun rare', 'rare,commun'), ['rare', 'commun'])
  assert.deepEqual(parseQRequired('commun rare', ' rare , '), ['rare']) // trimmed, empties dropped
  assert.throws(() => parseQRequired('commun rare', 'absent'))
  assert.throws(() => parseQRequired('commun rare', 'rar')) // partial words are not tokens
})

test('chooseStrictestCandidate picks the strictest candidate clearing the floor', () => {
  // candidates ordered strictest-first (here: labels standing in for any payload)
  const candidates = [
    { label: 'all-5-words', sampledCount: 1 },
    { label: '4-rarest', sampledCount: 59 },
    { label: '3-rarest', sampledCount: 589 },
    { label: '2-rarest', sampledCount: 4289 },
    { label: 'unrestricted', sampledCount: 22356 }
  ]
  // floorSample = cap × probability × safety = 10000 × 0.01 × 1.2 = 120
  const chosen = chooseStrictestCandidate(candidates, 120)
  assert.equal(chosen.label, '3-rarest') // 589 ≥ 120; '4-rarest' (est ~5 900 < cap) would tighten below the horizon
  assert.equal(chosen.sampledCount, 589)
})

test('chooseStrictestCandidate falls back to the loosest candidate when nothing clears the floor', () => {
  // the "rue baudelaire" shape: strict set far below the cap → keep full OR semantics
  const chosen = chooseStrictestCandidate([{ label: 'strict', sampledCount: 3 }, { label: 'loose', sampledCount: 14119 }], 120)
  assert.equal(chosen.label, 'loose')
})
