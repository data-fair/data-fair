import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { unicityAggField } from '../src/datasets/es/operations.ts'

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
