import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { SessionState } from '@data-fair/lib-express'
import { getAsVisitorContext } from '../../../api/src/misc/utils/as-visitor.ts'

// auditing a listing as a chosen visitor is an admin act: a scoped session needs the admin tier
// of the audited family on top of the org admin role

const orgAdmin = (scopes?: string[]): SessionState => {
  const state: any = {
    lang: 'fr',
    user: { id: 'admin1', email: 'admin1@test.com', name: 'Admin 1', organizations: [{ id: 'org1', name: 'Org 1', role: 'admin' }] },
    organization: { id: 'org1', name: 'Org 1', role: 'admin' },
    account: { type: 'organization', id: 'org1', name: 'Org 1' },
    accountRole: 'admin'
  }
  if (scopes) state.scopes = scopes
  return state
}

test.describe('asVisitor and token scopes', () => {
  test('the read and write tiers are refused', () => {
    for (const scopes of [['datasets:read'], ['datasets:write'], ['applications:admin']]) {
      assert.throws(() => getAsVisitorContext('anonymous', orgAdmin(scopes), 'admin', 'datasets'), { status: 403 }, scopes.join())
    }
  })

  test('the admin tier and the umbrella are accepted', () => {
    for (const scopes of [['datasets:admin'], ['datasets'], ['datasets:read', 'datasets:admin']]) {
      assert.ok(getAsVisitorContext('anonymous', orgAdmin(scopes), 'admin', 'datasets'), scopes.join())
    }
    assert.ok(getAsVisitorContext('anonymous', orgAdmin(['applications:admin']), 'admin', 'applications'))
  })

  test('a scoped session is refused when the caller names no family', () => {
    assert.throws(() => getAsVisitorContext('anonymous', orgAdmin(['datasets:admin']), 'admin'), { status: 403 })
  })

  test('an unrestricted session is unaffected', () => {
    assert.ok(getAsVisitorContext('anonymous', orgAdmin(), 'admin', 'datasets'))
    assert.ok(getAsVisitorContext('anonymous', orgAdmin(), 'admin'))
  })
})
