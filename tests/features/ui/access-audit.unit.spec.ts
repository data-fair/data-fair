import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { asVisitorParam, parseVisitor, serializeVisitor } from '../../../ui/src/utils/access-audit.ts'

const org = {}

test('serializes each visitor kind like the asVisitor API param', () => {
  assert.equal(asVisitorParam({ kind: 'anonymous' }, org), 'anonymous')
  assert.equal(asVisitorParam({ kind: 'connected' }, org), 'connected')
  assert.equal(asVisitorParam({ kind: 'email', email: 'a@b.c' }, org), 'email:a@b.c')
  assert.equal(
    asVisitorParam({ kind: 'member', member: { id: 'u1', name: 'U1', email: 'u1@b.c', role: 'contrib', department: 'dep1' } }, org),
    'member:u1:u1@b.c:contrib:dep1'
  )
  assert.equal(asVisitorParam({ kind: 'member', member: { id: 'u1', name: 'U1', email: 'u1@b.c', role: 'user' } }, org), 'member:u1:u1@b.c:user')
  assert.equal(asVisitorParam({ kind: 'role', role: 'contrib' }, org), 'role:contrib')
  assert.equal(asVisitorParam({ kind: 'role', role: 'contrib', department: 'dep1' }, org), 'role:contrib:dep1')
  assert.equal(asVisitorParam({ kind: 'partner', partner: { id: 'org2', name: 'Org 2' } }, org), 'partner:org2')
})

test('an incomplete visitor has no API param but still round-trips through the URL', () => {
  assert.equal(asVisitorParam(null, org), undefined)
  for (const raw of ['email', 'member', 'role', 'role::dep1', 'partner']) {
    const visitor = parseVisitor(raw)!
    assert.equal(asVisitorParam(visitor, org), undefined, raw)
    assert.equal(serializeVisitor(visitor), raw)
  }
})

test('parses what it serializes, names falling back to ids', () => {
  for (const raw of ['anonymous', 'connected', 'email:a@b.c', 'member:u1:u1@b.c:contrib:dep1', 'role:user:dep1', 'partner:org2']) {
    assert.equal(serializeVisitor(parseVisitor(raw)!), raw)
  }
  assert.equal(parseVisitor('member:u1:u1@b.c:user')!.member!.name, 'u1@b.c')
  assert.equal(parseVisitor('partner:org2')!.partner!.name, 'org2')
  assert.equal(parseVisitor('unknown'), null)
  assert.equal(parseVisitor('{"kind":"anonymous"}'), null)
})

test('a department admin audits role visitors of their own department', () => {
  const depAccount = { department: 'dep1' }
  assert.equal(asVisitorParam({ kind: 'role', role: 'user', department: 'dep2' }, depAccount), 'role:user:dep1')
  assert.equal(asVisitorParam({ kind: 'role', role: 'user', department: 'dep2' }, org), 'role:user:dep2')
})
