import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { SessionState } from '@data-fair/lib-express'
import { operations } from '../../../shared/permissions/operations.ts'
import { scopeFamilyOf, tierOfClass, acceptedScopes, scopeAllowsClass, familyScopes, scopeDescriptions } from '../../../api/src/misc/utils/scopes.ts'

const scoped = (...scopes: string[]) => ({ user: { id: 'u' }, scopes }) as unknown as SessionState
const unrestricted = { user: { id: 'u' } } as unknown as SessionState

test.describe('scope vocabulary', () => {
  test('every class of the operations source is decided: a tier or deliberately ungranted', () => {
    const expected: Record<string, string> = { list: 'read', read: 'read', readAdvanced: 'read', write: 'write', manageOwnLines: 'write', post: 'write', admin: 'admin', manageMasterData: 'admin' }
    // classes of operations that scoped sessions never get (superadmin routes, routes covered by another operation)
    const ungranted = new Set(operations.filter(op => op.grouping === 'superadmin' || op.grouping === 'documented').map(op => op.class))
    const allClasses = new Set(operations.map(op => op.class))
    // a class both granted and ungranted would be a bug in the source
    for (const cl of Object.keys(expected)) assert.ok(!ungranted.has(cl) || operations.some(op => op.class === cl && op.grouping !== 'superadmin' && op.grouping !== 'documented'), cl)
    const decided = new Set([...Object.keys(expected), ...ungranted])
    assert.deepEqual([...allClasses].sort(), [...decided].sort(), 'a new permission class needs a tier decision in scopes.ts and this test')
    for (const op of operations) {
      if (op.grouping === 'superadmin' || op.grouping === 'documented') {
        if (!expected[op.class]) assert.equal(tierOfClass(op.class), undefined, `${op.resourceType} ${op.id}`)
      } else {
        assert.equal(tierOfClass(op.class), expected[op.class], `${op.resourceType} ${op.id} (${op.class})`)
      }
    }
    assert.ok(operations.some(op => op.grouping === 'contrib') && operations.some(op => op.grouping === 'ownerAdmin'))
  })

  test('superadmin and unknown classes have no tier', () => {
    for (const cl of ['superadmin', 'diagnose', 'reindex', 'readSomething', '', 'toString']) assert.equal(tierOfClass(cl), undefined)
  })

  test('scopeFamilyOf', () => {
    assert.equal(scopeFamilyOf('datasets'), 'datasets')
    assert.equal(scopeFamilyOf('applications'), 'applications')
    assert.equal(scopeFamilyOf('remote-services'), undefined)
  })

  test('acceptedScopes', () => {
    assert.deepEqual(acceptedScopes('datasets', 'read'), ['datasets:read', 'datasets:write', 'datasets:admin', 'datasets'])
    assert.deepEqual(acceptedScopes('datasets', 'write'), ['datasets:write', 'datasets:admin', 'datasets'])
    assert.deepEqual(acceptedScopes('applications', 'admin'), ['applications:admin', 'applications'])
    assert.deepEqual(familyScopes('applications'), ['applications', 'applications:read', 'applications:write', 'applications:admin'])
  })

  test('scopeAllowsClass', () => {
    for (const cl of ['read', 'write', 'admin', 'superadmin']) assert.equal(scopeAllowsClass(unrestricted, 'remote-services', cl), true)
    const r = scoped('datasets:read')
    for (const cl of ['read', 'readAdvanced', 'list']) assert.equal(scopeAllowsClass(r, 'datasets', cl), true, cl)
    for (const cl of ['write', 'admin', 'post', 'superadmin']) assert.equal(scopeAllowsClass(r, 'datasets', cl), false, cl)
    const w = scoped('datasets:write')
    for (const cl of ['write', 'post', 'manageOwnLines', 'read']) assert.equal(scopeAllowsClass(w, 'datasets', cl), true, cl)
    assert.equal(scopeAllowsClass(w, 'datasets', 'admin'), false)
    assert.equal(scopeAllowsClass(scoped('datasets'), 'datasets', 'admin'), true)
    assert.equal(scopeAllowsClass(scoped('datasets'), 'datasets', 'manageMasterData'), true)
    assert.equal(scopeAllowsClass(scoped('datasets'), 'datasets', 'superadmin'), false)
    assert.equal(scopeAllowsClass(scoped('applications:admin'), 'datasets', 'read'), false)
    assert.equal(scopeAllowsClass(scoped('datasets:readAdvanced'), 'datasets', 'read'), false)
    assert.equal(scopeAllowsClass(scoped('datasets:admin'), 'remote-services', 'read'), false)
  })

  test('scopeDescriptions lists the 8 scopes in both locales', () => {
    const names = ['datasets', 'datasets:read', 'datasets:write', 'datasets:admin', 'applications', 'applications:read', 'applications:write', 'applications:admin']
    for (const locale of ['fr', 'en'] as const) {
      const d = scopeDescriptions(locale)
      assert.deepEqual(Object.keys(d).sort(), [...names].sort())
      for (const v of Object.values(d)) assert.ok(v.length > 3)
    }
    assert.equal(scopeDescriptions('en').datasets, 'All dataset scopes')
    assert.equal(scopeDescriptions('fr')['datasets:read'], 'Lire les jeux de données, leurs données, leur journal')
  })
})
