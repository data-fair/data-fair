import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseOwnerParams, cleanSettings } from '../../../api/src/settings/operations.ts'

test.describe('parseOwnerParams', () => {
  test('org without department — owner has no department, ownerFilter has $exists:false', () => {
    const params = parseOwnerParams('organization', 'org1')
    assert.deepEqual(params.owner, { type: 'organization', id: 'org1' })
    assert.equal(params.department, undefined)
    assert.deepEqual(params.ownerFilter, { type: 'organization', id: 'org1', department: { $exists: false } })
  })

  test('org with department — owner and ownerFilter both have department, no $exists', () => {
    const params = parseOwnerParams('organization', 'org1:dep1')
    assert.deepEqual(params.owner, { type: 'organization', id: 'org1', department: 'dep1' })
    assert.equal(params.department, 'dep1')
    assert.deepEqual(params.ownerFilter, { type: 'organization', id: 'org1', department: 'dep1' })
  })

  test('org with wildcard department — params.department is "*", owner has NO department, ownerFilter has no department key and no $exists', () => {
    const params = parseOwnerParams('organization', 'org1:*')
    assert.equal(params.department, '*')
    // owner.department is NOT set when department === '*'
    assert.deepEqual(params.owner, { type: 'organization', id: 'org1' })
    // ownerFilter = { ...owner } so no department key, no $exists
    assert.deepEqual(params.ownerFilter, { type: 'organization', id: 'org1' })
  })

  test('user without department', () => {
    const params = parseOwnerParams('user', 'u1')
    assert.deepEqual(params.owner, { type: 'user', id: 'u1' })
    assert.equal(params.department, undefined)
    assert.deepEqual(params.ownerFilter, { type: 'user', id: 'u1', department: { $exists: false } })
  })
})

test.describe('cleanSettings', () => {
  test('strips key, notifiedJ3At, notifiedJAt from apiKeys and _id from settings', () => {
    const settings: any = {
      _id: 'mongo-id',
      type: 'organization',
      id: 'org1',
      apiKeys: [
        { id: 'k1', title: 'Key 1', key: 'secret-hash', notifiedJ3At: '2024-01-01', notifiedJAt: '2024-01-02', scopes: [] },
        { id: 'k2', title: 'Key 2', scopes: [] }
      ]
    }
    const result: any = cleanSettings(settings)
    // returns same object
    assert.equal(result, settings)
    // _id is removed
    assert.equal('_id' in result, false)
    // apiKey secrets stripped
    assert.equal('key' in result.apiKeys[0], false)
    assert.equal('notifiedJ3At' in result.apiKeys[0], false)
    assert.equal('notifiedJAt' in result.apiKeys[0], false)
    // non-sensitive fields preserved
    assert.equal(result.apiKeys[0].id, 'k1')
    assert.equal(result.apiKeys[0].title, 'Key 1')
    // second key untouched (no secret fields were present)
    assert.equal(result.apiKeys[1].id, 'k2')
  })
})
