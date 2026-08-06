import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseQMode, parseQIgnored, buildOrAdaptCandidates, chooseStrictestCandidate } from '../../../api/src/datasets/es/operations.ts'

test('parseQMode accepts the legacy and new modes', () => {
  assert.equal(parseQMode(undefined, 'simple'), 'simple')
  assert.equal(parseQMode(undefined, 'adapt'), 'adapt')
  assert.equal(parseQMode('or', 'simple'), 'simple') // alias
  assert.equal(parseQMode('simple', 'adapt'), 'simple')
  assert.equal(parseQMode('complete', 'simple'), 'complete')
  assert.equal(parseQMode('and', 'simple'), 'and')
  assert.equal(parseQMode('adapt', 'simple'), 'adapt')
  assert.throws(() => parseQMode('3', 'simple'), { status: 400 }) // numeric msm deliberately not supported
  assert.throws(() => parseQMode('bogus', 'simple'), { status: 400 })
})

test('parseQIgnored accepts only whitespace tokens of q and must leave a word retained', () => {
  assert.deepEqual(parseQIgnored('commun rare', 'commun'), ['commun'])
  assert.deepEqual(parseQIgnored('commun alpha beta', ' commun , alpha '), ['commun', 'alpha'])
  assert.throws(() => parseQIgnored('commun rare', 'absent'), { status: 400 })
  assert.throws(() => parseQIgnored('commun rare', 'commu'), { status: 400 }) // partial words are not tokens
  assert.throws(() => parseQIgnored('commun rare', 'commun,rare'), { status: 400 }) // nothing left to filter on
  assert.throws(() => parseQIgnored('commun rare', 'commun,commun,rare'), { status: 400 }) // duplicates don't hide full coverage
})

test('buildOrAdaptCandidates orders strictest-first and lets bounds fill the counts', () => {
  // rue-baudelaire shape: one rare pivot — the strictest candidate is decided by its solo count
  const c1 = buildOrAdaptCandidates(['rue', 'baudelaire'], { rue: 14000, baudelaire: 7 }, 14119, 120)
  assert.deepEqual(c1, [
    { ignored: ['rue'], retained: ['baudelaire'], sampledCount: 7 }, // solo bound, disqualified
    { ignored: [], retained: ['rue', 'baudelaire'], sampledCount: 14119 } // the plain-OR fallback
  ])
  // a qualifying single-word candidate stops the walk (nothing looser can be chosen)
  const c2 = buildOrAdaptCandidates(['commun', 'rare'], { commun: 1030, rare: 100 }, 1100, 60)
  assert.deepEqual(c2, [
    { ignored: ['commun'], retained: ['rare'], sampledCount: 100 },
    { ignored: [], retained: ['commun', 'rare'], sampledCount: 1100 }
  ])
  // sum-bound disqualifies without counting; max-bound qualifies and stops the walk with
  // sampledCount null (the preflight counts it for the display total)
  const c3 = buildOrAdaptCandidates(
    ['de', 'la', 'amis', 'bibliothèque'],
    { de: 25000, la: 22000, amis: 750, bibliothèque: 101 },
    30000, 120)
  assert.deepEqual(c3, [
    { ignored: ['de', 'la', 'amis'], retained: ['bibliothèque'], sampledCount: 101 }, // solo, disqualified
    { ignored: ['de', 'la'], retained: ['amis', 'bibliothèque'], sampledCount: null }, // max 750 ≥ 120: chosen, needs its total
    { ignored: [], retained: ['de', 'la', 'amis', 'bibliothèque'], sampledCount: 30000 }
  ])
  // sum-bound: two tiny words can be disqualified together without an ES count
  const c4 = buildOrAdaptCandidates(['big', 'x', 'y'], { big: 5000, x: 20, y: 30 }, 5040, 120)
  assert.equal(c4[1].sampledCount, 50) // {x,y} union ≤ 20+30 < 120 — no count needed
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
