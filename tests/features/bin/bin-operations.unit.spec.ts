import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { isShelvedExpired, shouldPurge, binAudienceFilter, canSeeBin, notShelved, onlyShelved } from '../../../api/src/bin/operations.ts'

const session = (role: string, department?: string, adminMode = false): any => ({
  user: { id: 'u', name: 'U', email: 'u@test.com', organizations: [{ id: 'o1', name: 'O1', role, department }], adminMode },
  account: { type: 'organization', id: 'o1', name: 'O1', department },
  accountRole: role
})

test.describe('bin operations', () => {
  test('isShelvedExpired', () => {
    assert.equal(isShelvedExpired('2026-01-01T00:00:00Z', 30, new Date('2026-01-30T23:59:59Z')), false)
    assert.equal(isShelvedExpired('2026-01-01T00:00:00Z', 30, new Date('2026-01-31T00:00:00Z')), true)
  })

  test('shouldPurge re-reads the current settings', () => {
    const at = '2026-01-01T00:00:00Z'
    const now = new Date('2026-01-05T00:00:00Z')
    assert.equal(shouldPurge({ active: false, retentionDays: 30 }, at, now), true, 'bin off purges everything')
    assert.equal(shouldPurge({ active: true, retentionDays: 30 }, at, now), false, 're-enabled keeps non expired')
    assert.equal(shouldPurge({ active: true, retentionDays: 3 }, at, now), true, 'past retention')
  })

  test('filters', () => {
    assert.deepEqual(notShelved, { shelved: { $exists: false } })
    assert.deepEqual(onlyShelved, { shelved: { $exists: true } })
  })

  test('binAudienceFilter', () => {
    assert.deepEqual(binAudienceFilter({ type: 'organization', id: 'o1' }), { 'owner.type': 'organization', 'owner.id': 'o1' })
    assert.deepEqual(binAudienceFilter({ type: 'organization', id: 'o1', department: 'd1' }), { 'owner.type': 'organization', 'owner.id': 'o1', 'owner.department': 'd1' })
  })

  test('canSeeBin', () => {
    const d1 = { type: 'organization', id: 'o1', department: 'd1' }
    const d2 = { type: 'organization', id: 'o1', department: 'd2' }
    const root = { type: 'organization', id: 'o1' }
    assert.equal(canSeeBin(session('admin'), d1, 'admin'), true)
    assert.equal(canSeeBin(session('admin'), root, 'admin'), true)
    assert.equal(canSeeBin(session('admin', 'd1'), d1, 'admin'), true)
    assert.equal(canSeeBin(session('admin', 'd1'), d2, 'admin'), false)
    assert.equal(canSeeBin(session('admin', 'd1'), root, 'admin'), false)
    assert.equal(canSeeBin(session('contrib'), root, 'admin'), false)
    assert.equal(canSeeBin(session('contrib', 'd1'), d1, 'admin'), false)
    assert.equal(canSeeBin({} as any, root, 'admin'), false)
  })
})
