import { test, expect } from '@playwright/test'
import * as ops from '../../../api/src/integrity/operations.ts'

const owner = { type: 'organization', id: 'acme' }

test('padIndex zero-pads to width 9', () => {
  expect(ops.padIndex(0)).toBe('000000000')
  expect(ops.padIndex(42)).toBe('000000042')
})

test('revisionPrefix and revisionKey follow the class-segmented layout', () => {
  expect(ops.revisionPrefix(owner, 'ds1', 'file')).toBe('data-fair/organization-acme/ds1/file/')
  expect(ops.revisionPrefix(owner, 'ds1', 'metadata')).toBe('data-fair/organization-acme/ds1/metadata/')
  expect(ops.revisionKey(owner, 'ds1', 'file', 7)).toBe('data-fair/organization-acme/ds1/file/000000007')
})

test('parseRevisionIndex and parseRevisionClass extract from a class-segmented key', () => {
  expect(ops.parseRevisionIndex('data-fair/organization-acme/ds1/metadata/000000007')).toBe(7)
  expect(ops.parseRevisionClass('data-fair/organization-acme/ds1/metadata/000000007')).toBe('metadata')
  expect(ops.parseRevisionClass('data-fair/organization-acme/ds1/file/000000000')).toBe('file')
})

test('nextIndex returns 0 for an empty store and max+1 otherwise', () => {
  expect(ops.nextIndex([])).toBe(0)
  expect(ops.nextIndex([
    'data-fair/organization-acme/ds1/file/000000000',
    'data-fair/organization-acme/ds1/file/000000002'
  ])).toBe(3)
})

test('latestKey returns the highest-index key via lexical sort', () => {
  expect(ops.latestKey([])).toBeUndefined()
  expect(ops.latestKey([
    'data-fair/organization-acme/ds1/file/000000002',
    'data-fair/organization-acme/ds1/file/000000010',
    'data-fair/organization-acme/ds1/file/000000009'
  ])).toBe('data-fair/organization-acme/ds1/file/000000010')
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

test('coveredMetadata drops underscore fields and the operational denylist', () => {
  const doc = {
    id: 'ds1',
    title: 'T',
    schema: [{ key: 'a' }],
    permissions: [],
    topics: [{ id: 't1' }],
    status: 'finalized',
    draft: { title: 'D' },
    integrity: { active: true },
    count: 12,
    storage: { size: 1 },
    esWarning: 'w',
    finalizedAt: 'x',
    dataUpdatedAt: 'x',
    dataUpdatedBy: 'u',
    updatedAt: 'x',
    updatedBy: { id: 'u' },
    createdBy: { id: 'u' },
    errorStatus: 'e',
    errorRetry: 'x',
    loaded: {},
    descendants: [],
    _id: 'mongo',
    _needsHistorizing: { classes: ['metadata'] },
    _partialRestStatus: 'indexed'
  }
  expect(ops.coveredMetadata(doc)).toEqual({ id: 'ds1', title: 'T', schema: [{ key: 'a' }], permissions: [], topics: [{ id: 't1' }] })
})

test('coveredMetadata strips worker-maintained churn nested in covered fields', () => {
  const doc = {
    id: 'ds1',
    extensions: [{
      type: 'remoteService',
      remoteService: 'r',
      action: 'a',
      needsUpdate: true,
      nextUpdate: 'x',
      autoUpdate: { active: true }
    }],
    rest: {
      ttl: { active: true, checkedAt: 'x', delay: { value: 1, unit: 'days' } },
      history: false
    },
    extras: { applications: [{ id: 'app1' }], custom: 'kept' }
  }
  expect(ops.coveredMetadata(doc)).toEqual({
    id: 'ds1',
    extensions: [{
      type: 'remoteService',
      remoteService: 'r',
      action: 'a',
      autoUpdate: { active: true }
    }],
    rest: {
      ttl: { active: true, delay: { value: 1, unit: 'days' } },
      history: false
    },
    extras: { custom: 'kept' }
  })
})

test('metadataHash is stable across key order and volatile-field changes', () => {
  const a = { id: 'ds1', title: 'T', schema: [{ key: 'a', type: 'string' }] }
  const b = { schema: [{ type: 'string', key: 'a' }], title: 'T', id: 'ds1', status: 'error', _partialRestStatus: 'indexed' }
  expect(ops.metadataHash(a)).toBe(ops.metadataHash(b))
  expect(ops.metadataHash(a)).toMatch(/^[0-9a-f]{64}$/)
  expect(ops.metadataHash({ ...a, title: 'changed' })).not.toBe(ops.metadataHash(a))
})

test('coveredPatchKeys keeps only covered top-level keys', () => {
  expect(ops.coveredPatchKeys({ title: 'T', status: 'indexed', updatedAt: 'x', _needsHistorizing: { classes: [] }, schema: [] }))
    .toEqual(['title', 'schema'])
  expect(ops.coveredPatchKeys({ status: 'error', errorStatus: 'e', count: 1 })).toEqual([])
})

test('stampHistorize merges the outbox stamp into an existing update', () => {
  const update: any = { $set: { permissions: [] } }
  ops.stampHistorize(update, ['metadata'], { operation: 'update', originator: 'user:u1' })
  expect(update).toEqual({
    $set: { permissions: [], '_needsHistorizing.context': { operation: 'update', originator: 'user:u1' } },
    $addToSet: { '_needsHistorizing.classes': { $each: ['metadata'] } }
  })
  const bare: any = {}
  ops.stampHistorize(bare, ['file', 'metadata'])
  expect(bare).toEqual({ $addToSet: { '_needsHistorizing.classes': { $each: ['file', 'metadata'] } } })
})

test('stampHistorize with an empty classes array leaves the update untouched', () => {
  const update: any = { $set: { title: 'T' } }
  const result = ops.stampHistorize(update, [], { operation: 'update', originator: 'user:u1' })
  // an empty-classes stamp would be invisible to both the relay filter and the checker sweep
  expect(result).toEqual({ $set: { title: 'T' } })
  expect(result.$addToSet).toBeUndefined()

  const bare: any = {}
  expect(ops.stampHistorize(bare, [])).toEqual({})
})

test('coveredMetadata strips readApiKey renewal churn but keeps active/interval', () => {
  const base = {
    id: 'ds1',
    readApiKey: { active: true, interval: 'P1M', expiresAt: '2026-07-01T00:00:00.000Z', renewAt: '2026-06-15T00:00:00.000Z' }
  }
  const renewed = {
    id: 'ds1',
    readApiKey: { active: true, interval: 'P1M', expiresAt: '2026-08-01T00:00:00.000Z', renewAt: '2026-07-15T00:00:00.000Z' }
  }
  expect(ops.coveredMetadata(base)).toEqual({ id: 'ds1', readApiKey: { active: true, interval: 'P1M' } })
  // hash stable across expiresAt/renewAt-only changes (the renewApiKey worker's churn)
  expect(ops.metadataHash(base)).toBe(ops.metadataHash(renewed))
  // but sensitive to an actual active flip
  const disabled = { id: 'ds1', readApiKey: { ...base.readApiKey, active: false } }
  expect(ops.metadataHash(base)).not.toBe(ops.metadataHash(disabled))
})
