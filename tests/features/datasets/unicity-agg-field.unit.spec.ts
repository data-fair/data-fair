import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { unicityAggField, unicityKeyPartLabel } from '../../../api/src/datasets/es/operations.ts'

test.describe('unicityAggField', () => {
  test('plain string column aggregates on the keyword base field', () => {
    assert.equal(unicityAggField({ key: 'a', type: 'string' }), 'a')
  })

  test('string column with wildcard capability aggregates on the .wildcard subfield', () => {
    assert.equal(unicityAggField({ key: 'a', type: 'string', 'x-capabilities': { wildcard: true } }), 'a.wildcard')
  })

  test('numeric column aggregates on the base field', () => {
    assert.equal(unicityAggField({ key: 'n', type: 'integer' }), 'n')
  })

  test('date column aggregates on the base field', () => {
    assert.equal(unicityAggField({ key: 'd', type: 'string', format: 'date-time' }), 'd')
  })
})

test.describe('unicityKeyPartLabel', () => {
  test('plain string column value is passed through unchanged', () => {
    assert.equal(unicityKeyPartLabel({ key: 'a', type: 'string' }, 'hello'), 'hello')
  })

  test('numeric column value is stringified', () => {
    assert.equal(unicityKeyPartLabel({ key: 'n', type: 'integer' }, 42), '42')
  })

  test('date column converts the epoch-millis composite key to YYYY-MM-DD', () => {
    // 2024-07-02T00:00:00.000Z
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date' }, 1719878400000), '2024-07-02')
  })

  test('date-time column converts the epoch-millis composite key to a full ISO string', () => {
    // 2024-07-02T06:30:00.000Z
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date-time' }, 1719901800000), '2024-07-02T06:30:00.000Z')
  })

  test('null/undefined bucket key is guarded to an empty string', () => {
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date' }, null), '')
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date-time' }, undefined), '')
  })

  test('a non-numeric value on a date column is guarded (not passed to Date())', () => {
    // defensive: composite terms sources never emit non-numeric keys for a date field, but a
    // malformed value must never crash the indexer with an "Invalid Date" / NaN result
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date' }, 'not-a-number'), 'not-a-number')
  })

  test('NaN on a date column is guarded (not passed to Date(), which would throw RangeError)', () => {
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date' }, NaN), 'NaN')
  })

  test('Infinity on a date-time column is guarded (not passed to Date(), which would throw RangeError)', () => {
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date-time' }, Infinity), 'Infinity')
    assert.equal(unicityKeyPartLabel({ key: 'd', type: 'string', format: 'date-time' }, -Infinity), '-Infinity')
  })
})
