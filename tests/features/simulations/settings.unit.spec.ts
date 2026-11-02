/**
 * Deterministic checks on the bridge provider settings. No model and no network
 * involved, so these run in the normal unit suite and catch the two mistakes
 * that otherwise only surface as a mid-conversation failure ten minutes into a
 * paid run.
 */

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bridgeSettings, MODEL_ROLES, OWNER, runErrors } from '../../../simulations/runner/settings.ts'

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
    // The tools role, the compaction summariser and the moderation guard are the
    // roles a deployment puts on a small model. Running them on the assistant's
    // model costs more per case and hides the failures a real user would hit —
    // a background prompt only a large model can follow still reads as working.
    const { org } = bridgeSettings('sonnet', 'haiku')
    assert.equal(org.modelMapping.assistant.id, 'sonnet')
    assert.equal(org.modelMapping.tools.id, 'haiku')
    assert.equal(org.modelMapping.summarizer.id, 'haiku')
    assert.equal(org.modelMapping.moderator.id, 'haiku')
  })

  test('declares exactly the roles the agents service accepts', () => {
    // the agents settings schema refuses any other role (an "evaluator" role was dropped there), and
    // a refused settings PUT fails every case at setup
    assert.deepEqual([...MODEL_ROLES].sort(), ['assistant', 'moderator', 'summarizer', 'tools'])
    for (const entry of bridgeSettings('sonnet', 'haiku').superadmin.models) {
      for (const role of entry.usage) assert.ok((MODEL_ROLES as readonly string[]).includes(role), role)
    }
  })

  test('lists one catalog entry per model, even when both roles share it', () => {
    assert.equal(bridgeSettings('sonnet', 'haiku').superadmin.models.length, 2)
    const [only] = bridgeSettings('sonnet', 'sonnet').superadmin.models
    assert.equal(bridgeSettings('sonnet', 'sonnet').superadmin.models.length, 1)
    assert.deepEqual([...only.usage].sort(), [...MODEL_ROLES].sort())
  })

  test('prices the run at zero', () => {
    const { superadmin } = bridgeSettings('sonnet', 'haiku')
    for (const entry of superadmin.models) {
      assert.equal(entry.inputPricePerMillion, 0)
      assert.equal(entry.outputPricePerMillion, 0)
    }
  })

  test('enables review of the personal assistant, so its runs can be read back through the conversation export', () => {
    // the back-office cases talk to the personal assistant, whose threads the export only serves when the
    // organization enabled review (and the person consented: the runner sets the consent cookie); without it
    // every such run would have no evidence and be recorded invalid. An autonomous agent's are always reviewable.
    assert.equal(bridgeSettings('sonnet', 'haiku').org.reviewPersonalAssistant, true)
    assert.equal('storeTraces' in bridgeSettings('sonnet', 'haiku').org, false, 'the agents API refuses the old name')
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

test.describe('run errors from the conversation export', () => {
  const parsed = (runs: any[]) => [{ conversationId: 'c', messages: [], runs, blobs: new Map() }] as any

  test('a run that ended in error makes the case unjudgeable', () => {
    assert.deepEqual(runErrors(parsed([{ status: 'done', calls: [] }, { status: 'error', stopReason: 'provider: rate limited', calls: [] }])), ['provider: rate limited'])
  })

  test('reports the run\'s own error over its stop reason', () => {
    // a refused or failed turn stops with the bare reason 'error'; the cause is in the run's error
    assert.deepEqual(runErrors(parsed([{ status: 'error', stopReason: 'error', error: 'credit cap reached', calls: [] }])), ['credit cap reached'])
  })

  test('finished and aborted runs report nothing', () => {
    assert.deepEqual(runErrors(parsed([{ status: 'done', calls: [] }, { status: 'aborted', calls: [] }])), [])
  })

  test('an error without a stop reason is still reported', () => {
    assert.deepEqual(runErrors(parsed([{ status: 'error', calls: [] }])), ['run ended in error'])
  })
})

test.describe('the conversations a run exports', () => {
  test('keeps only this person\'s conversations created since the run started', async () => {
    const { runConversations } = await import('../../../simulations/runner/settings.ts')
    const since = new Date('2026-10-08T09:57:45Z')
    const listed = [
      { conversationId: 'earlier-case', userId: 'test_user1', startedAt: '2026-10-08T09:57:10Z' },
      { conversationId: 'this-run', userId: 'test_user1', startedAt: '2026-10-08T09:57:46Z' },
      { conversationId: 'someone-else', userId: 'test_user2', startedAt: '2026-10-08T09:57:50Z' }
    ]
    assert.deepEqual(runConversations(listed, 'test_user1', since).map(c => c.conversationId), ['this-run'])
  })
})
