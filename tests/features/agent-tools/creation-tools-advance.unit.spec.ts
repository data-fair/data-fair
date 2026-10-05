/**
 * advance_to_confirmation used to set the step and return at once — before the
 * confirmation step's conflict check (it starts when that step mounts) had even
 * begun. Its result therefore always carried ready:false, and the ready:true that
 * followed a second later missed the tool's drain window: in a judged run it
 * reached the model two minutes later, while the assistant had already told the
 * person the button was ready on faith. The tool now waits, bounded, and says
 * what it found — naming the button the page actually shows.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { untilReady, formatAdvanceResult, resolveInitParts, noDataReason } from '../../../ui/src/composables/dataset/agent-creation-tools-logic.ts'

test.describe('untilReady', () => {
  test('resolves true as soon as the getter turns true', async () => {
    let ready = false
    setTimeout(() => { ready = true }, 60)
    const started = Date.now()
    assert.equal(await untilReady(() => ready, 2000, 10), true)
    assert.ok(Date.now() - started < 1000, 'must not run to the timeout')
  })

  test('resolves false at the timeout when it never turns true', async () => {
    const started = Date.now()
    assert.equal(await untilReady(() => false, 120, 10), false)
    assert.ok(Date.now() - started >= 100)
  })

  test('is immediate when already true', async () => {
    const started = Date.now()
    assert.equal(await untilReady(() => true, 2000, 10), true)
    assert.ok(Date.now() - started < 50)
  })
})

test.describe('formatAdvanceResult', () => {
  test('when ready, names the real button', () => {
    const out = formatAdvanceResult(true, 'Créer le jeu de données')
    assert.match(out, /confirmation step/)
    assert.match(out, /ready/)
    assert.ok(out.includes('« Créer le jeu de données »'), out)
  })

  test('when not ready in time, says the check is still pending rather than inventing', () => {
    const out = formatAdvanceResult(false, 'Créer le jeu de données')
    assert.match(out, /confirmation step/)
    assert.match(out, /not.*ready|still|pending/i)
    assert.ok(!/can click/.test(out), out)
  })
})

test.describe('resolveInitParts', () => {
  const finalized = { count: 2, finalizedAt: '2026-01-01' }

  test('without parts, the step keeps its own default', () => {
    assert.deepEqual(resolveInitParts(undefined, finalized, { allowData: true }), {})
  })

  test('asked-for parts always include the columns of a dataset that has some', () => {
    assert.deepEqual(resolveInitParts(['description', 'keywords'], finalized, { allowData: true }), { parts: ['schema', 'description', 'keywords'] })
    assert.deepEqual(resolveInitParts(['summary'], { isMetaOnly: true }, { allowData: true }), { parts: ['summary'] })
  })

  test('refuses a part the API does not know', () => {
    assert.match((resolveInitParts(['columns'], finalized, { allowData: true }) as any).error, /unknown part/)
  })

  test('refuses the data where the step would', () => {
    assert.match((resolveInitParts(['data'], finalized, { allowData: false }) as any).error, /not offered/)
    assert.match((resolveInitParts(['data'], { isMetaOnly: true }, { allowData: true }) as any).error, /not offered/)
    assert.match((resolveInitParts(['data'], { count: 2 }, { allowData: true }) as any).error, /not finalized/)
    assert.match((resolveInitParts(['data'], { count: 0, finalizedAt: 'x' }, { allowData: true }) as any).error, /no rows/)
    assert.deepEqual(resolveInitParts(['data'], { file: { name: 'a.csv' } }, { allowData: true }), { parts: ['schema', 'data'] })
    assert.deepEqual(resolveInitParts(['data'], finalized, { allowData: true }), { parts: ['schema', 'data'] })
  })

  test('the reasons match the step', () => {
    assert.equal(noDataReason(finalized, true), null)
  })
})
