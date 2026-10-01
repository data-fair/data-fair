import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatNumber } from '../../../ui/src/composables/dataset/format-number-logic.ts'

test.describe('formatNumber', () => {
  test('follows the UI locale, not the runtime default', () => {
    assert.equal(formatNumber(12500.5, 'fr'), '12 500,5')
    assert.equal(formatNumber(12500.5, 'en'), '12,500.5')
  })

  test('does not group 4-digit integers, so years stay readable', () => {
    assert.equal(formatNumber(1987, 'fr'), '1987')
    assert.equal(formatNumber(2500, 'en'), '2500')
  })
})
