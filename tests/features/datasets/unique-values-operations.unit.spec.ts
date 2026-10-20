import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { hasUniqueValues, UNIQUE_VALUES_PRECISION_THRESHOLD } from '../../../api/src/datasets/es/operations.ts'

test('below the precision threshold the distinct count must equal the number of lines', () => {
  assert.equal(hasUniqueValues(4, 4), true)
  assert.equal(hasUniqueValues(3, 4), false)
  assert.equal(hasUniqueValues(UNIQUE_VALUES_PRECISION_THRESHOLD, UNIQUE_VALUES_PRECISION_THRESHOLD), true)
  assert.equal(hasUniqueValues(UNIQUE_VALUES_PRECISION_THRESHOLD - 1, UNIQUE_VALUES_PRECISION_THRESHOLD), false)
})

test('above the precision threshold the approximate distinct count gets a 1% tolerance both ways', () => {
  assert.equal(hasUniqueValues(1_000_000, 1_000_000), true)
  assert.equal(hasUniqueValues(1_009_000, 1_000_000), true)
  assert.equal(hasUniqueValues(991_000, 1_000_000), true)
  assert.equal(hasUniqueValues(989_000, 1_000_000), false)
  assert.equal(hasUniqueValues(500_000, 1_000_000), false)
})

test('no line, no unique column', () => {
  assert.equal(hasUniqueValues(0, 0), false)
})
