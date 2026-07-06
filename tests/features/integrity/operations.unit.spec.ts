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

test('needsRenewal is false without a retainUntil and while the lock is fresh', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const day = 24 * 3600 * 1000
  expect(ops.needsRenewal(undefined, now, 365)).toBe(false)
  // a fresh 1-year lock: age ~0 → not due
  expect(ops.needsRenewal(new Date(now + 365 * day).toISOString(), now, 365)).toBe(false)
})

test('needsRenewal triggers once the lock is older than RENEW_INTERVAL of the window', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const day = 24 * 3600 * 1000
  // 1-year window, RENEW_INTERVAL = 1/12 → due when age > ~30.4d, i.e. remaining < ~334.6d
  expect(ops.needsRenewal(new Date(now + 334 * day).toISOString(), now, 365)).toBe(true)  // age ~31d
  expect(ops.needsRenewal(new Date(now + 336 * day).toISOString(), now, 365)).toBe(false) // age ~29d
})

test('needsRenewal scales to a 1-day (dev/test) window', () => {
  const now = Date.parse('2026-07-06T00:00:00.000Z')
  const hour = 3600 * 1000
  // 1-day window → due when age > 2h, i.e. remaining < 22h
  expect(ops.needsRenewal(new Date(now + 21 * hour).toISOString(), now, 1)).toBe(true)
  expect(ops.needsRenewal(new Date(now + 23 * hour).toISOString(), now, 1)).toBe(false)
})
