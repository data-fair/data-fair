import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { asVisitorDescriptor } from '../../../ui/src/utils/access-audit.ts'

const org = { id: 'org1' }
const parse = (s: string | undefined) => s === undefined ? undefined : JSON.parse(s)

test('maps each visitor kind to an asVisitor descriptor', () => {
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'anonymous' }, org)), {})
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'connected' }, org)), { user: {} })
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'email', email: 'a@b.c' }, org)), { user: { email: 'a@b.c' } })
  assert.deepEqual(
    parse(asVisitorDescriptor({ kind: 'member', member: { id: 'u1', name: 'U1', email: 'u1@b.c', role: 'contrib', department: 'dep1' } }, org)),
    { user: { id: 'u1', email: 'u1@b.c' }, organization: { id: 'org1', role: 'contrib', department: 'dep1' } }
  )
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'role', role: 'contrib' }, org)), { organization: { id: 'org1', role: 'contrib' } })
  assert.deepEqual(
    parse(asVisitorDescriptor({ kind: 'partner', partner: { id: 'org2', name: 'Org 2' } }, org)),
    { organization: { id: 'org2', name: 'Org 2', role: 'user' } }
  )
})

test('an incomplete visitor has no descriptor', () => {
  assert.equal(asVisitorDescriptor(null, org), undefined)
  assert.equal(asVisitorDescriptor({ kind: 'email' }, org), undefined)
  assert.equal(asVisitorDescriptor({ kind: 'member' }, org), undefined)
  assert.equal(asVisitorDescriptor({ kind: 'role' }, org), undefined)
  assert.equal(asVisitorDescriptor({ kind: 'partner' }, org), undefined)
})

test('a department admin audits role visitors of their own department', () => {
  const depAccount = { id: 'org1', department: 'dep1' }
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'role', role: 'user', department: 'dep2' }, depAccount)), { organization: { id: 'org1', role: 'user', department: 'dep1' } })
  assert.deepEqual(parse(asVisitorDescriptor({ kind: 'role', role: 'user', department: 'dep2' }, org)), { organization: { id: 'org1', role: 'user', department: 'dep2' } })
})
