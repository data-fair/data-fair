/**
 * Deterministic checks on the bridge provider settings. No model and no network
 * involved, so these run in the normal unit suite and catch the two mistakes
 * that otherwise only surface as a mid-conversation failure ten minutes into a
 * paid run.
 */

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bridgeSettings, MODEL_ROLES, OWNER } from '../../../simulations/runner/settings.ts'

test.describe('bridge provider settings', () => {
  test('declares the provider openai-compatible in compatible mode', () => {
    const settings = bridgeSettings('sonnet', 'haiku')
    assert.equal(settings.providers.length, 1)
    assert.equal(settings.providers[0].type, 'openai-compatible')
    // Mandatory. In 'default' mode createModel targets /v1/responses, which the
    // bridge does not implement, so every case dies on its first turn.
    assert.equal(settings.providers[0].compatibility, 'compatible')
  })

  test('fills every model role, so none falls back at the first tool call', () => {
    const settings = bridgeSettings('sonnet', 'haiku')
    // A role left unset has no provider, and the run fails at the first tool
    // call or summarisation rather than at setup, where it would be diagnosable.
    for (const role of MODEL_ROLES) {
      assert.ok(settings.models[role].model.id, `role ${role}`)
      assert.equal(settings.models[role].model.provider.id, 'bridge', `role ${role}`)
    }
  })

  test('runs the background roles on the cheaper model, as a real deployment would', () => {
    // The sub-agents, the compaction summariser and the moderation guard are the
    // roles a deployment puts on a small model. Running them on the assistant's
    // model costs more per case and hides the failures a real user would hit —
    // a sub-agent prompt only a large model can follow still reads as working.
    const settings = bridgeSettings('sonnet', 'haiku')
    assert.equal(settings.models.assistant.model.id, 'sonnet')
    assert.equal(settings.models.tools.model.id, 'haiku')
    assert.equal(settings.models.summarizer.model.id, 'haiku')
    assert.equal(settings.models.moderator.model.id, 'haiku')
  })

  test('leaves the evaluator on the assistant model, being a review role and not part of a run', () => {
    assert.equal(bridgeSettings('sonnet', 'haiku').models.evaluator.model.id, 'sonnet')
  })

  test('prices the run at zero and stores no traces', () => {
    const settings = bridgeSettings('sonnet', 'haiku')
    assert.equal(settings.models.assistant.inputPricePerMillion, 0)
    assert.equal(settings.models.assistant.outputPricePerMillion, 0)
    assert.equal(settings.storeTraces, false)
  })

  test('gives the admin role unlimited quota', () => {
    // Simulations run as test_user1, an admin of test_org1. A quota-limited
    // admin role would fail a long case partway through and look like a product
    // failure in the transcript.
    assert.equal(bridgeSettings('sonnet', 'haiku').quotas.admin.unlimited, true)
  })

  test('targets a test owner, so clean() can reset it', () => {
    assert.equal(OWNER.type, 'organization')
    assert.match(OWNER.id, /^test_/)
  })
})
