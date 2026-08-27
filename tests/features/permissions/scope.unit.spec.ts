import { test } from '@playwright/test'
import assert from 'node:assert'
import { parseScopeParams, scopeToParams, scenarioFromScope, scopeFromScenario } from '@data-fair/data-fair-shared/permissions/scope.ts'

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

test('scenarioFromScope recognizes each complete scope', () => {
  assert.equal(scenarioFromScope(null, 'koumoul'), null)
  assert.equal(scenarioFromScope({ type: 'public' }, 'koumoul'), 'anonymous')
  assert.equal(scenarioFromScope({ type: 'user', id: '*' }, 'koumoul'), 'connected')
  assert.equal(scenarioFromScope({ type: 'user', id: 'alban' }, 'koumoul'), 'member')
  assert.equal(scenarioFromScope({ type: 'user', email: 'a@b.com' }, 'koumoul'), 'email')
  assert.equal(scenarioFromScope({ type: 'organization', id: 'koumoul' }, 'koumoul'), 'group')
  assert.equal(scenarioFromScope({ type: 'organization', id: 'other' }, 'koumoul'), 'partner')
})

test('scenarioFromScope returns null when the sub-selection is still empty', () => {
  // an empty user scope is 'member' and 'email' at the same time, an organization scope
  // with no id is a partner not chosen yet: the component keeps its current scenario
  assert.equal(scenarioFromScope({ type: 'user' }, 'koumoul'), null)
  assert.equal(scenarioFromScope({ type: 'organization' }, 'koumoul'), null)
})

test('a member scope keeps its scenario once the membership is filled in', () => {
  const scope = { type: 'user' as const, id: 'alban', email: 'a@b.com', roles: ['contrib'], department: 'dep1' }
  assert.equal(scenarioFromScope(scope, 'koumoul'), 'member')
})

test('scopeFromScenario builds the initial scope of each scenario', () => {
  assert.deepEqual(scopeFromScenario('anonymous', 'koumoul'), { type: 'public' })
  assert.deepEqual(scopeFromScenario('connected', 'koumoul'), { type: 'user', id: '*' })
  assert.deepEqual(scopeFromScenario('member', 'koumoul'), { type: 'user' })
  assert.deepEqual(scopeFromScenario('email', 'koumoul'), { type: 'user' })
  assert.deepEqual(scopeFromScenario('group', 'koumoul'), { type: 'organization', id: 'koumoul' })
  assert.deepEqual(scopeFromScenario('partner', 'koumoul'), { type: 'organization' })
})

test('every scenario round-trips through the url parameters', () => {
  for (const scenario of ['anonymous', 'connected', 'group'] as const) {
    const scope = scopeFromScenario(scenario, 'koumoul')
    assert.equal(scenarioFromScope(parseScopeParams(scopeToParams(scope)), 'koumoul'), scenario)
  }
})
