import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { SessionState } from '@data-fair/lib-express'
import { getAsVisitorContext, unknownUserId } from '../../../api/src/misc/utils/as-visitor.ts'

const orgAdminSession: SessionState = {
  lang: 'fr',
  user: { id: 'admin1', email: 'admin1@test.com', name: 'Admin 1', organizations: [{ id: 'org1', name: 'Org 1', role: 'admin' }] },
  organization: { id: 'org1', name: 'Org 1', role: 'admin' },
  account: { type: 'organization', id: 'org1', name: 'Org 1' },
  accountRole: 'admin'
}
const memberParam = JSON.stringify({ user: { id: 'u8', email: 'u8@test.com' }, organization: { id: 'org1', role: 'user' } })

test('builds a synthetic session and owner filter for a member', () => {
  const ctx = getAsVisitorContext(memberParam, orgAdminSession, 'admin')
  assert.equal(ctx.sessionState.user?.id, 'u8')
  assert.equal(ctx.sessionState.user?.email, 'u8@test.com')
  assert.equal(ctx.sessionState.account?.type, 'organization')
  assert.equal(ctx.sessionState.account?.id, 'org1')
  assert.equal(ctx.sessionState.account?.department, undefined)
  assert.equal(ctx.sessionState.accountRole, 'user')
  assert.equal(ctx.sessionState.organization?.role, 'user')
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1' })
})

test('member department lands on the synthetic account and membership', () => {
  const raw = JSON.stringify({ user: { id: 'u6', email: 'u6@test.com' }, organization: { id: 'org1', role: 'contrib', department: 'dep1' } })
  const ctx = getAsVisitorContext(raw, orgAdminSession, 'admin')
  assert.equal(ctx.sessionState.account?.department, 'dep1')
  assert.equal(ctx.sessionState.organization?.department, 'dep1')
  // the owner filter scope comes from the CALLER's department, not the visitor's
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1' })
})

test('an empty descriptor is an anonymous visitor', () => {
  const ctx = getAsVisitorContext('{}', orgAdminSession, 'admin')
  assert.deepEqual(ctx.sessionState, { lang: 'fr' })
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1' })
})

test('a user without organization is active on a personal account', () => {
  const ctx = getAsVisitorContext(JSON.stringify({ user: { email: 'ext@test.com' } }), orgAdminSession, 'admin')
  assert.equal(ctx.sessionState.user?.id, unknownUserId)
  assert.equal(ctx.sessionState.user?.email, 'ext@test.com')
  assert.deepEqual(ctx.sessionState.user?.organizations, [])
  assert.equal(ctx.sessionState.account?.type, 'user')
  assert.equal(ctx.sessionState.organization, undefined)

  const connected = getAsVisitorContext(JSON.stringify({ user: {} }), orgAdminSession, 'admin')
  assert.equal(connected.sessionState.user?.id, unknownUserId)
  assert.equal(connected.sessionState.user?.email, '')
})

test('an organization without user is any member with that role, partner organizations included', () => {
  const group = getAsVisitorContext(JSON.stringify({ organization: { id: 'org1', role: 'contrib' } }), orgAdminSession, 'admin')
  assert.equal(group.sessionState.user?.id, unknownUserId)
  assert.equal(group.sessionState.account?.id, 'org1')
  assert.equal(group.sessionState.accountRole, 'contrib')

  const partner = getAsVisitorContext(JSON.stringify({ organization: { id: 'org2', name: 'Org 2', role: 'user' } }), orgAdminSession, 'admin')
  assert.equal(partner.sessionState.account?.id, 'org2')
  assert.equal(partner.sessionState.account?.name, 'Org 2')
  // the audited perimeter stays the caller's organization
  assert.deepEqual(partner.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1' })
})

test('a department admin gets a department-scoped owner filter', () => {
  const depAdminSession: SessionState = { ...orgAdminSession, account: { type: 'organization', id: 'org1', name: 'Org 1', department: 'dep1' } }
  const ctx = getAsVisitorContext(memberParam, depAdminSession, 'admin')
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1', 'owner.department': 'dep1' })
})

test('rejects anonymous, personal accounts and non-admin roles', () => {
  assert.throws(() => getAsVisitorContext(memberParam, { lang: 'fr' }, 'admin'), { status: 401 })
  const personal: SessionState = { ...orgAdminSession, account: { type: 'user', id: 'admin1', name: 'Admin 1' }, accountRole: 'admin' }
  assert.throws(() => getAsVisitorContext(memberParam, personal, 'admin'), { status: 403 })
  const contrib: SessionState = { ...orgAdminSession, accountRole: 'contrib' }
  assert.throws(() => getAsVisitorContext(memberParam, contrib, 'admin'), { status: 403 })
})

test('superadmin in adminMode passes the gate', () => {
  const superadmin: SessionState = { ...orgAdminSession, user: { ...orgAdminSession.user!, adminMode: 1 }, accountRole: 'user' }
  const ctx = getAsVisitorContext(memberParam, superadmin, 'admin')
  assert.equal(ctx.sessionState.user?.id, 'u8')
})

test('rejects an org API-key session even when it carries an admin accountRole', () => {
  // readApiKey (api-key.ts) mints every org API-key session with accountRole = config.adminRole
  // regardless of the key's actual scopes, so the plain accountRole check alone would let a
  // read-scoped API key through. The isApiKey marker must be checked explicitly.
  const apiKeySession: SessionState & { isApiKey: true } = { ...orgAdminSession, isApiKey: true }
  assert.throws(() => getAsVisitorContext(memberParam, apiKeySession, 'admin'), { status: 403 })
})

test('rejects malformed descriptors', () => {
  assert.throws(() => getAsVisitorContext('not json', orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext('[]', orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext(JSON.stringify({ user: 'x' }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext(JSON.stringify({ user: { id: 42 } }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext(JSON.stringify({ organization: { id: 'org1' } }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext(JSON.stringify({ organization: { role: 'user' } }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsVisitorContext(JSON.stringify({ organization: { id: 'org1', role: 'user', department: 42 } }), orgAdminSession, 'admin'), { status: 400 })
})
