import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatApplicationConfig } from '../../../ui/src/composables/application/agent-tools-logic.ts'

test.describe('formatApplicationConfig', () => {
  test('returns a not-configured message for empty config', () => {
    assert.equal(formatApplicationConfig(null), 'This application is not configured yet.')
    assert.equal(formatApplicationConfig(undefined), 'This application is not configured yet.')
    assert.equal(formatApplicationConfig({}), 'This application is not configured yet.')
  })

  test('pretty-prints a non-empty config inside a json code fence', () => {
    const out = formatApplicationConfig({ datasets: [{ id: 'd1' }], title: 'X' })
    assert.ok(out.startsWith('```json\n'))
    assert.ok(out.endsWith('\n```'))
    assert.ok(out.includes('"datasets"'))
    assert.ok(out.includes('  '))
  })
})
