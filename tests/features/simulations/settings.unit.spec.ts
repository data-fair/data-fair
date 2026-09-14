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
    const settings = bridgeSettings('sonnet')
    assert.equal(settings.providers.length, 1)
    assert.equal(settings.providers[0].type, 'openai-compatible')
    // Mandatory. In 'default' mode createModel targets /v1/responses, which the
    // bridge does not implement, so every case dies on its first turn.
    assert.equal(settings.providers[0].compatibility, 'compatible')
  })

  test('fills every model role with the requested model', () => {
    const settings = bridgeSettings('haiku')
    // A role left unset has no provider, and the run fails at the first tool
    // call or summarisation rather than at setup, where it would be diagnosable.
    for (const role of MODEL_ROLES) {
      assert.equal(settings.models[role].model.id, 'haiku', `role ${role}`)
      assert.equal(settings.models[role].model.provider.id, 'bridge', `role ${role}`)
    }
  })

  test('prices the run at zero and stores no traces', () => {
    const settings = bridgeSettings('sonnet')
    assert.equal(settings.models.assistant.inputPricePerMillion, 0)
    assert.equal(settings.models.assistant.outputPricePerMillion, 0)
    assert.equal(settings.storeTraces, false)
  })

  test('gives the admin role unlimited quota', () => {
    // Simulations run as test_user1, an admin of test_org1. A quota-limited
    // admin role would fail a long case partway through and look like a product
    // failure in the transcript.
    assert.equal(bridgeSettings('sonnet').quotas.admin.unlimited, true)
  })

  test('targets a test owner, so clean() can reset it', () => {
    assert.equal(OWNER.type, 'organization')
    assert.match(OWNER.id, /^test_/)
  })
})
