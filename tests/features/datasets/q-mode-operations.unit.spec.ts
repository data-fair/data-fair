import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseQMode, decideAdaptiveRung } from '../../../api/src/datasets/es/operations.ts'

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

test('decideAdaptiveRung picks the strictest rung whose sampled support clears the floor', () => {
  // spectrum ordered strictest-first (here: labels standing in for any rung payload)
  const spectrum = [
    { rung: 'all-5-words', sampled: 1 },
    { rung: '4-rarest', sampled: 59 },
    { rung: '3-rarest', sampled: 589 },
    { rung: '2-rarest', sampled: 4289 },
    { rung: 'unrestricted', sampled: 22356 }
  ]
  // floorSample = cap × probability × safety = 10000 × 0.01 × 1.2 = 120
  const d = decideAdaptiveRung(spectrum, 120)
  assert.equal(d.rung, '3-rarest') // 589 ≥ 120; '4-rarest' (est ~5 900 < cap) would tighten below the horizon
  assert.equal(d.sampled, 589)
})

test('decideAdaptiveRung falls back to the loosest rung when nothing clears the floor', () => {
  // the "rue baudelaire" shape: strict set far below the cap → keep full OR semantics
  const d = decideAdaptiveRung([{ rung: 'strict', sampled: 3 }, { rung: 'loose', sampled: 14119 }], 120)
  assert.equal(d.rung, 'loose')
})
