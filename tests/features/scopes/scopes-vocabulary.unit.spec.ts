import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { SessionState } from '@data-fair/lib-express'
import { operationsClasses, contribOperationsClasses, adminOperationsClasses } from '../../../shared/permissions/operations.ts'
import { scopeFamilyOf, tierOfClass, acceptedScopes, scopeAllowsClass, familyScopes, scopeDescriptions } from '../../../api/src/misc/utils/scopes.ts'

const scoped = (...scopes: string[]) => ({ user: { id: 'u' }, scopes }) as unknown as SessionState
const unrestricted = { user: { id: 'u' } } as unknown as SessionState

test.describe('scope vocabulary', () => {
  test('every class of the operations source maps to its tier', () => {
    const expected: Record<string, string> = { list: 'read', read: 'read', readAdvanced: 'read', write: 'write', manageOwnLines: 'write', admin: 'admin' }
    for (const rt of ['datasets', 'applications'] as const) {
      for (const cl of Object.keys(operationsClasses[rt])) assert.equal(tierOfClass(cl), expected[cl], `${rt} ${cl}`)
      for (const id of contribOperationsClasses[rt]) assert.equal(tierOfClass('post'), 'write', id)
      for (const id of adminOperationsClasses[rt]) assert.equal(tierOfClass('manageMasterData'), 'admin', id)
    }
    assert.equal(tierOfClass('post'), 'write')
    assert.equal(tierOfClass('manageMasterData'), 'admin')
  })

  test('superadmin and unknown classes have no tier', () => {
    for (const cl of ['superadmin', 'diagnose', 'reindex', 'readSomething', '']) assert.equal(tierOfClass(cl), undefined)
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
