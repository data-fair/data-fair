import { test, expect } from '@playwright/test'
import * as ops from '../../../api/src/integrity/operations.ts'

const owner = { type: 'organization', id: 'acme' }

test('padIndex zero-pads to width 9', () => {
  expect(ops.padIndex(0)).toBe('000000000')
  expect(ops.padIndex(42)).toBe('000000042')
})

test('revisionPrefix and revisionKey follow the agreed layout', () => {
  expect(ops.revisionPrefix(owner, 'ds1')).toBe('data-fair/organization-acme/ds1/')
  expect(ops.revisionKey(owner, 'ds1', 7)).toBe('data-fair/organization-acme/ds1/000000007')
})

test('parseRevisionIndex extracts the numeric index from a key', () => {
  expect(ops.parseRevisionIndex('data-fair/organization-acme/ds1/000000007')).toBe(7)
})

test('nextIndex returns 0 for an empty store and max+1 otherwise', () => {
  expect(ops.nextIndex([])).toBe(0)
  expect(ops.nextIndex([
    'data-fair/organization-acme/ds1/000000000',
    'data-fair/organization-acme/ds1/000000002'
  ])).toBe(3)
})

test('latestKey returns the highest-index key via lexical sort', () => {
  expect(ops.latestKey([])).toBeUndefined()
  expect(ops.latestKey([
    'data-fair/organization-acme/ds1/000000002',
    'data-fair/organization-acme/ds1/000000010',
    'data-fair/organization-acme/ds1/000000009'
  ])).toBe('data-fair/organization-acme/ds1/000000010')
})

test('buildContext omits reason when not provided', () => {
  expect(ops.buildContext('create', 'worker:historize', '2026-06-24T00:00:00.000Z'))
    .toEqual({ operation: 'create', originator: 'worker:historize', date: '2026-06-24T00:00:00.000Z' })
  expect(ops.buildContext('fixIntegrity', 'user:1', '2026-06-24T00:00:00.000Z', 'manual fix').reason).toBe('manual fix')
})
