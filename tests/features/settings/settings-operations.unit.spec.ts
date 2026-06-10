import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseOwnerParams, cleanSettings, fillSettings } from '../../../api/src/settings/operations.ts'

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

  test('no apiKeys property — returns same object, no throw', () => {
    const settings: any = { type: 'organization', id: 'org1' }
    const result = cleanSettings(settings)
    assert.equal(result, settings)
    assert.equal('apiKeys' in result, false)
  })
})

test.describe('parseOwnerParams (empty-string department)', () => {
  test('empty-string department is falsy: behaves exactly like no department', () => {
    // idParam 'org1:' splits into id='org1', department='' — empty string is falsy
    const params = parseOwnerParams('organization', 'org1:')
    // no department field set on params
    assert.equal(params.department, undefined)
    // owner has no department
    assert.deepEqual(params.owner, { type: 'organization', id: 'org1' })
    // ownerFilter gets $exists:false (same as the no-department path)
    assert.deepEqual(params.ownerFilter, { type: 'organization', id: 'org1', department: { $exists: false } })
  })
})

test.describe('fillSettings', () => {
  test('user owner: gains type/id, name, email, empty apiKeys and publicationSites', () => {
    const owner = { type: 'user' as const, id: 'u1' }
    const user = { name: 'User One', email: 'u1@test.com', organizations: [] } as any
    const result: any = fillSettings(owner, user, {})
    assert.equal(result.type, 'user')
    assert.equal(result.id, 'u1')
    assert.equal(result.name, 'User One')
    assert.equal(result.email, 'u1@test.com')
    assert.deepEqual(result.apiKeys, [])
    assert.deepEqual(result.publicationSites, [])
  })

  test('org owner with department: name is "Org One - dep1"', () => {
    const owner = { type: 'organization' as const, id: 'o1', department: 'dep1' }
    const user = { name: 'Admin', email: 'admin@test.com', organizations: [{ id: 'o1', name: 'Org One' }] } as any
    const result: any = fillSettings(owner, user, {})
    assert.equal(result.name, 'Org One - dep1')
  })

  test('org owner NOT in user.organizations: throws plain Error with message "base org ref in user"', () => {
    // Converting this to an httpError is a parking-lot decision — do not do it silently in later tasks.
    const owner = { type: 'organization' as const, id: 'o-unknown' }
    const user = { name: 'Admin', email: 'admin@test.com', organizations: [] } as any
    assert.throws(
      () => fillSettings(owner, user, {}),
      (err: any) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'base org ref in user')
        // must be a plain Error, not an http error
        assert.equal('status' in err, false)
        return true
      }
    )
  })

  test('strips clearKey from provided apiKeys and deletes operationsPermissions', () => {
    const owner = { type: 'user' as const, id: 'u1' }
    const user = { name: 'User One', email: 'u1@test.com', organizations: [] } as any
    const settings: any = {
      apiKeys: [{ id: 'k1', title: 'Key 1', clearKey: 'base64secret', scopes: [] }],
      operationsPermissions: { read: ['u1'] }
    }
    const result: any = fillSettings(owner, user, settings)
    assert.equal('clearKey' in result.apiKeys[0], false)
    assert.equal('operationsPermissions' in result, false)
  })
})
