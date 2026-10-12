import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { OWNER } from '../../../simulations/runner/settings.ts'

test('simulations target a test owner, so clean() can reset it', () => {
  assert.equal(OWNER.type, 'organization')
  assert.match(OWNER.id, /^test_/)
})
