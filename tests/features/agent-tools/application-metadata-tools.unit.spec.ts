import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validateApplicationSummary } from '../../../ui/src/composables/application/agent-metadata-tools-logic.ts'

test.describe('validateApplicationSummary', () => {
  test('accepts a concise specific summary', () => {
    assert.equal(validateApplicationSummary('Interactive map of EV charging stations in France.'), null)
  })

  test('rejects a summary longer than 300 characters', () => {
    const long = 'a'.repeat(301)
    const err = validateApplicationSummary(long)
    assert.ok(err && err.includes('301 characters'))
  })

  test('rejects a generic English opening', () => {
    const err = validateApplicationSummary('This application is a dashboard.')
    assert.ok(err && err.includes('generic phrase'))
  })

  test('rejects a generic French opening (case-insensitive)', () => {
    const err = validateApplicationSummary('Cette application est un tableau de bord.')
    assert.ok(err && err.includes('generic phrase'))
  })
})
