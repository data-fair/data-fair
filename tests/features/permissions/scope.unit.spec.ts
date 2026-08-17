import { test } from '@playwright/test'
import assert from 'node:assert'
import { parseScopeParams, scopeToParams } from '@data-fair/data-fair-shared/permissions/scope.ts'

test('parseScopeParams returns null without a scopeType', () => {
  assert.equal(parseScopeParams({}), null)
  assert.equal(parseScopeParams({ scopeRoles: 'contrib' }), null)
})

test('parseScopeParams reads a public scope', () => {
  assert.deepEqual(parseScopeParams({ scopeType: 'public' }), { type: 'public' })
})

test('parseScopeParams reads an organization scope with roles', () => {
  assert.deepEqual(parseScopeParams({
    scopeType: 'organization',
    scopeId: 'koumoul',
    scopeDepartment: 'dep1',
    scopeRoles: 'contrib,user'
  }), {
    type: 'organization',
    id: 'koumoul',
    department: 'dep1',
    roles: ['contrib', 'user']
  })
})

test('parseScopeParams reads a user scope by email', () => {
  assert.deepEqual(parseScopeParams({ scopeType: 'user', scopeEmail: 'a@b.com' }), {
    type: 'user',
    email: 'a@b.com'
  })
})

test('parseScopeParams rejects an unknown scopeType', () => {
  assert.equal(parseScopeParams({ scopeType: 'wathever' }), null)
})

test('scopeToParams is the inverse of parseScopeParams', () => {
  const scope = { type: 'organization' as const, id: 'koumoul', roles: ['contrib'] }
  assert.deepEqual(scopeToParams(scope), {
    scopeType: 'organization',
    scopeId: 'koumoul',
    scopeRoles: 'contrib'
  })
  assert.deepEqual(parseScopeParams(scopeToParams(scope)), scope)
})

test('scopeToParams returns nothing for a null scope', () => {
  assert.deepEqual(scopeToParams(null), {})
})
