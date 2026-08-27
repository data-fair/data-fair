import { test } from '@playwright/test'
import assert from 'node:assert'
import { effectiveAccess, accessClasses } from '@data-fair/data-fair-shared/permissions/effective-access.ts'

const account = { type: 'organization', id: 'koumoul' }
const owned = (permissions: any[]) => ({ owner: { type: 'organization', id: 'koumoul' }, permissions })

test('a public permission is a source for every scope, anonymous included', () => {
  const resource = owned([{ classes: ['list', 'read'] }])
  for (const scope of [{ type: 'public' as const }, { type: 'user' as const, id: '*' }]) {
    const sources = effectiveAccess(scope, resource, account)
    assert.equal(sources.length, 1)
    assert.equal(sources[0].kind, 'public')
    assert.deepEqual(sources[0].classes, ['list', 'read'])
  }
})

test('a permission open to every authenticated user does not reach an anonymous scope', () => {
  const resource = owned([{ type: 'user', id: '*', classes: ['list'] }])
  assert.deepEqual(effectiveAccess({ type: 'public' }, resource, account), [])
  const sources = effectiveAccess({ type: 'user', id: '*' }, resource, account)
  assert.equal(sources[0].kind, 'connected')
})

test('a nominative permission matches on the id, an email permission on the email', () => {
  const resource = owned([
    { type: 'user', id: 'alban', name: 'Alban', classes: ['read'] },
    { type: 'user', id: 'other', email: 'guest@example.com', name: 'Guest', classes: ['list'] }
  ])
  const byId = effectiveAccess({ type: 'user', id: 'alban' }, resource, account)
  assert.deepEqual(byId.map(s => s.kind), ['user'])
  const byEmail = effectiveAccess({ type: 'user', email: 'guest@example.com' }, resource, account)
  assert.deepEqual(byEmail.map(s => s.kind), ['email'])
})

test('an organization permission matches a compatible role and department', () => {
  const resource = owned([
    { type: 'organization', id: 'koumoul', roles: ['contrib'], department: 'dep1', name: 'Koumoul', classes: ['read'] }
  ])
  const matching = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['contrib'], department: 'dep1' }, resource, account)
  assert.equal(matching[0].kind, 'organization')
  assert.deepEqual(matching[0].roles, ['contrib'])
  assert.equal(matching[0].department, 'dep1')

  const wrongRole = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['user'], department: 'dep1' }, resource, account)
  assert.deepEqual(wrongRole.map(s => s.kind), [])
  const wrongDep = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['contrib'], department: 'dep2' }, resource, account)
  assert.deepEqual(wrongDep.map(s => s.kind), [])
})

test('a scope with no department is not department-filtered, like matchPermission', () => {
  const resource = owned([{ type: 'organization', id: 'koumoul', department: 'dep1', classes: ['read'] }])
  const sources = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['contrib'] }, resource, account)
  assert.equal(sources[0].kind, 'organization')
})

test('a member scope picks up what their group grants', () => {
  const resource = owned([{ type: 'organization', id: 'koumoul', roles: ['contrib'], classes: ['list', 'read'] }])
  const sources = effectiveAccess({ type: 'user', id: 'alban', roles: ['contrib'] }, resource, account)
  assert.deepEqual(sources.map(s => s.kind), ['organization'])
})

test('an admin of the owner organization holds implicit rights on everything it owns', () => {
  const resource = owned([])
  const sources = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['admin'] }, resource, account)
  assert.deepEqual(sources.map(s => s.kind), ['ownerAdmin'])
  assert.equal(accessClasses(sources), '*')
})

test('a group with no role selected includes its admins, so it holds the implicit rights', () => {
  const sources = effectiveAccess({ type: 'organization', id: 'koumoul' }, owned([]), account)
  assert.deepEqual(sources.map(s => s.kind), ['ownerAdmin'])
})

test('a contributor group holds no implicit right', () => {
  const sources = effectiveAccess({ type: 'organization', id: 'koumoul', roles: ['contrib'] }, owned([]), account)
  assert.deepEqual(sources, [])
})

test('a partner organization is reported with its own id, not the audited account', () => {
  const resource = owned([
    { type: 'organization', id: 'partner-org', name: 'Partner Org', classes: ['list', 'read'] }
  ])
  const sources = effectiveAccess({ type: 'organization', id: 'partner-org' }, resource, account)
  assert.deepEqual(sources.map(s => s.kind), ['organization'])
  assert.equal(sources[0].organizationId, 'partner-org')
  assert.equal(sources[0].organizationName, 'Partner Org')
  assert.deepEqual(accessClasses(sources), ['list', 'read'], 'a partner holds no implicit right on the audited account')
})

test('a user owns their personal account', () => {
  const resource = { owner: { type: 'user', id: 'alban' }, permissions: [] }
  const sources = effectiveAccess({ type: 'user', id: 'alban' }, resource, account)
  assert.deepEqual(sources.map(s => s.kind), ['personalAccount'])
  assert.equal(accessClasses(sources), '*')
})

test('several sources are all reported, and their classes are unioned', () => {
  const resource = owned([
    { classes: ['list'] },
    { type: 'organization', id: 'koumoul', roles: ['contrib'], classes: ['list', 'write'] }
  ])
  const sources = effectiveAccess({ type: 'user', id: 'alban', roles: ['contrib'] }, resource, account)
  assert.deepEqual(sources.map(s => s.kind), ['public', 'organization'])
  assert.deepEqual(accessClasses(sources), ['list', 'write'])
})
