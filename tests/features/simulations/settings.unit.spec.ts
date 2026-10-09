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
    const { superadmin } = bridgeSettings('sonnet', 'haiku')
    assert.equal(superadmin.providers.length, 1)
    assert.equal(superadmin.providers[0].type, 'openai-compatible')
    // Mandatory. In 'default' mode createModel targets /v1/responses, which the
    // bridge does not implement, so every case dies on its first turn.
    assert.equal(superadmin.providers[0].compatibility, 'compatible')
  })

  test('maps every model role, so none falls back to the deployment default', () => {
    const { superadmin, org } = bridgeSettings('sonnet', 'haiku')
    // An unmapped role falls back to the global default model, not the bridge,
    // and the run fails at the first tool call or summarisation rather than at
    // setup, where it would be diagnosable.
    for (const role of MODEL_ROLES) {
      const ref = org.modelMapping[role]
      assert.equal(ref.provider, 'bridge', `role ${role}`)
      // The agents API refuses a mapping to a model its catalog does not offer
      // for that role.
      const entry = superadmin.models.find(m => m.model.id === ref.id)
      assert.ok(entry?.usage.includes(role), `role ${role}`)
    }
  })

  test('runs the background roles on the cheaper model, as a real deployment would', () => {
    // The sub-agents, the compaction summariser and the moderation guard are the
    // roles a deployment puts on a small model. Running them on the assistant's
    // model costs more per case and hides the failures a real user would hit —
    // a sub-agent prompt only a large model can follow still reads as working.
    const { org } = bridgeSettings('sonnet', 'haiku')
    assert.equal(org.modelMapping.assistant.id, 'sonnet')
    assert.equal(org.modelMapping.tools.id, 'haiku')
    assert.equal(org.modelMapping.summarizer.id, 'haiku')
    assert.equal(org.modelMapping.moderator.id, 'haiku')
  })

  test('leaves the evaluator on the assistant model, being a review role and not part of a run', () => {
    assert.equal(bridgeSettings('sonnet', 'haiku').org.modelMapping.evaluator.id, 'sonnet')
  })

  test('lists one catalog entry per model, even when both roles share it', () => {
    assert.equal(bridgeSettings('sonnet', 'haiku').superadmin.models.length, 2)
    const [only] = bridgeSettings('sonnet', 'sonnet').superadmin.models
    assert.equal(bridgeSettings('sonnet', 'sonnet').superadmin.models.length, 1)
    assert.deepEqual([...only.usage].sort(), [...MODEL_ROLES].sort())
  })

  test('prices the run at zero and stores no traces', () => {
    const { superadmin, org } = bridgeSettings('sonnet', 'haiku')
    for (const entry of superadmin.models) {
      assert.equal(entry.inputPricePerMillion, 0)
      assert.equal(entry.outputPricePerMillion, 0)
    }
    assert.equal(org.storeTraces, false)
  })

  test('gives the admin role unlimited quota', () => {
    // Simulations run as test_user1, an admin of test_org1. A quota-limited
    // admin role would fail a long case partway through and look like a product
    // failure in the transcript.
    assert.equal(bridgeSettings('sonnet', 'haiku').org.quotas.admin.unlimited, true)
  })

  test('targets a test owner, so clean() can reset it', () => {
    assert.equal(OWNER.type, 'organization')
    assert.match(OWNER.id, /^test_/)
  })
})
