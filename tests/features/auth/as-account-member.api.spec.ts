import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const anonymous = axios()
const orgAdmin = await axiosAuth('test_user1@test.com', 'test_org1')
const orgContrib = await axiosAuth('test_user5@test.com', 'test_org1')
const user1Personal = await axiosAuth('test_user1@test.com')
const user3 = await axiosAuth('test_user3@test.com')
const depAdmin = await axiosAuth('test_user4@test.com', 'test_org1')
depAdmin.setOrg('test_org1', 'dep1')

const member8 = { id: 'test_user8', email: 'test_user8@test.com', role: 'user' }
const member5 = { id: 'test_user5', email: 'test_user5@test.com', role: 'contrib' }
const member6 = { id: 'test_user6', email: 'test_user6@test.com', role: 'contrib', department: 'dep1' }
const member1 = { id: 'test_user1', email: 'test_user1@test.com', role: 'admin' }
const asMember = (member: Record<string, string>, extraParams: Record<string, string> = {}) =>
  ({ params: { asAccountMember: JSON.stringify(member), ...extraParams } })

test.describe('asAccountMember list override', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('org admin lists datasets as another member', async () => {
    // dsA: explicit user permission for test_user8 (the PUT replaces the default contrib permissions)
    const dsA = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit a' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsA.id}/permissions`, [{ type: 'user', id: 'test_user8', classes: ['list', 'read'] }])
    // dsB: default permissions (org contribs can list/read/write)
    const dsB = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit b' })).data
    // dsC: permission granted by email only
    const dsC = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit c' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsC.id}/permissions`, [{ type: 'user', email: 'test_user8@test.com', classes: ['list', 'read'] }])
    // noise outside the forced org scope: a public dataset and a shared-with-member dataset owned by another user
    const dsPublic = (await user3.post('/api/v1/datasets', { isRest: true, title: 'audit public' })).data
    await user3.put(`/api/v1/datasets/${dsPublic.id}/permissions`, [{ operations: ['readDescription', 'list'] }])
    const dsShared = (await user3.post('/api/v1/datasets', { isRest: true, title: 'audit shared' })).data
    await user3.put(`/api/v1/datasets/${dsShared.id}/permissions`, [{ type: 'user', id: 'test_user8', classes: ['list', 'read'] }])

    // member with role "user": only the explicit + email grants, external noise excluded
    let res = await orgAdmin.get('/api/v1/datasets', asMember(member8))
    assert.equal(res.data.count, 2)
    assert.deepEqual(res.data.results.map((r: any) => r.id).sort(), [dsA.id, dsC.id].sort())
    // userPermissions reflects the member, not the admin caller
    const dsARes = res.data.results.find((r: any) => r.id === dsA.id)
    assert.ok(dsARes.userPermissions.includes('readDescription'))
    assert.ok(!dsARes.userPermissions.includes('setPermissions'))

    // contrib member: sees the dataset that kept its default contrib permissions
    res = await orgAdmin.get('/api/v1/datasets', asMember(member5))
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, dsB.id)
    assert.ok(res.data.results[0].userPermissions.includes('writeDescription'))

    // admin member: implicit access to everything owned by the org
    res = await orgAdmin.get('/api/v1/datasets', asMember(member1))
    assert.equal(res.data.count, 3)

    // composes with can=
    res = await orgAdmin.get('/api/v1/datasets', asMember(member8, { can: 'write' }))
    assert.equal(res.data.count, 0)
    res = await orgAdmin.get('/api/v1/datasets', asMember(member5, { can: 'write' }))
    assert.equal(res.data.count, 1)
  })

  test('asAccountMember is restricted to org admins', async () => {
    await assert.rejects(orgContrib.get('/api/v1/datasets', asMember(member8)), { status: 403 })
    await assert.rejects(user1Personal.get('/api/v1/datasets', asMember(member8)), { status: 403 })
    await assert.rejects(anonymous.get('/api/v1/datasets', asMember(member8)), { status: 401 })
    await assert.rejects(orgAdmin.get('/api/v1/datasets', { params: { asAccountMember: 'not-json' } }), { status: 400 })
    await assert.rejects(orgAdmin.get('/api/v1/datasets', { params: { asAccountMember: JSON.stringify({ id: 'x', role: 'user' }) } }), { status: 400 })
  })

  test('department admin is scoped to their department resources', async () => {
    const dsOrg = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit org level' })).data
    const dsDep = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit dep1' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsDep.id}/owner`, { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: 'dep1' })

    // org admin auditing an org-level contrib sees both (default contrib permissions on both)
    let res = await orgAdmin.get('/api/v1/datasets', asMember(member5))
    assert.equal(res.data.count, 2)
    assert.ok(res.data.results.map((r: any) => r.id).includes(dsOrg.id))
    // the dep1 admin auditing the same member only sees dep1 resources
    res = await depAdmin.get('/api/v1/datasets', asMember(member5))
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, dsDep.id)
    // a dep1 contrib member has no access to the org-level dataset (default permissions carry department '-')
    res = await orgAdmin.get('/api/v1/datasets', asMember(member6))
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, dsDep.id)
  })

  test('the param is inert outside the list endpoints', async () => {
    const ds = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'audit inert' })).data
    // single-resource read ignores the param entirely (caller's own rights apply)
    const res = await orgAdmin.get(`/api/v1/datasets/${ds.id}`, asMember(member8))
    assert.equal(res.status, 200)
    assert.ok(res.data.userPermissions.includes('setPermissions'))
  })
})
