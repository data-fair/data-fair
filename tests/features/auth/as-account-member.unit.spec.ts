import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { SessionState } from '@data-fair/lib-express'
import { getAsAccountMemberContext } from '../../../api/src/misc/utils/as-account-member.ts'

const orgAdminSession: SessionState = {
  lang: 'fr',
  user: { id: 'admin1', email: 'admin1@test.com', name: 'Admin 1', organizations: [{ id: 'org1', name: 'Org 1', role: 'admin' }] },
  organization: { id: 'org1', name: 'Org 1', role: 'admin' },
  account: { type: 'organization', id: 'org1', name: 'Org 1' },
  accountRole: 'admin'
}
const memberParam = JSON.stringify({ id: 'u8', email: 'u8@test.com', role: 'user' })

test('builds a synthetic session and owner filter for an org admin', () => {
  const ctx = getAsAccountMemberContext(memberParam, orgAdminSession, 'admin')
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
  const raw = JSON.stringify({ id: 'u6', email: 'u6@test.com', role: 'contrib', department: 'dep1' })
  const ctx = getAsAccountMemberContext(raw, orgAdminSession, 'admin')
  assert.equal(ctx.sessionState.account?.department, 'dep1')
  assert.equal(ctx.sessionState.organization?.department, 'dep1')
  // the owner filter scope comes from the CALLER's department, not the member's
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1' })
})

test('a department admin gets a department-scoped owner filter', () => {
  const depAdminSession: SessionState = { ...orgAdminSession, account: { type: 'organization', id: 'org1', name: 'Org 1', department: 'dep1' } }
  const ctx = getAsAccountMemberContext(memberParam, depAdminSession, 'admin')
  assert.deepEqual(ctx.ownerFilter, { 'owner.type': 'organization', 'owner.id': 'org1', 'owner.department': 'dep1' })
})

test('rejects anonymous, personal accounts and non-admin roles', () => {
  assert.throws(() => getAsAccountMemberContext(memberParam, { lang: 'fr' }, 'admin'), { status: 401 })
  const personal: SessionState = { ...orgAdminSession, account: { type: 'user', id: 'admin1', name: 'Admin 1' }, accountRole: 'admin' }
  assert.throws(() => getAsAccountMemberContext(memberParam, personal, 'admin'), { status: 403 })
  const contrib: SessionState = { ...orgAdminSession, accountRole: 'contrib' }
  assert.throws(() => getAsAccountMemberContext(memberParam, contrib, 'admin'), { status: 403 })
})

test('superadmin in adminMode passes the gate', () => {
  const superadmin: SessionState = { ...orgAdminSession, user: { ...orgAdminSession.user!, adminMode: 1 }, accountRole: 'user' }
  const ctx = getAsAccountMemberContext(memberParam, superadmin, 'admin')
  assert.equal(ctx.sessionState.user?.id, 'u8')
})

test('rejects an org API-key session even when it carries an admin accountRole', () => {
  // readApiKey (api-key.ts) mints every org API-key session with accountRole = config.adminRole
  // regardless of the key's actual scopes, so the plain accountRole check alone would let a
  // read-scoped API key through. The isApiKey marker must be checked explicitly.
  const apiKeySession: SessionState & { isApiKey: true } = { ...orgAdminSession, isApiKey: true }
  assert.throws(() => getAsAccountMemberContext(memberParam, apiKeySession, 'admin'), { status: 403 })
})

test('rejects malformed descriptors', () => {
  assert.throws(() => getAsAccountMemberContext('not json', orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsAccountMemberContext(JSON.stringify({ id: 'x', role: 'user' }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsAccountMemberContext(JSON.stringify({ id: 'x', email: 'x@test.com' }), orgAdminSession, 'admin'), { status: 400 })
  assert.throws(() => getAsAccountMemberContext(JSON.stringify({ id: 'x', email: 'x@test.com', role: 'user', department: 42 }), orgAdminSession, 'admin'), { status: 400 })
})
