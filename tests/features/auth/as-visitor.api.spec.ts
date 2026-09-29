import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const anonymous = axios()
const orgAdmin = await axiosAuth('test_user1@test.com', 'test_org1')
const orgContrib = await axiosAuth('test_user5@test.com', 'test_org1')
const user1Personal = await axiosAuth('test_user1@test.com')
const user3 = await axiosAuth('test_user3@test.com')
const depAdmin = await axiosAuth('test_user4@test.com', 'test_org1')
depAdmin.setOrg('test_org1', 'dep1')

const orgMember = (id: string, role: string, department?: string) =>
  ['member', id, `${id}@test.com`, role, ...(department ? [department] : [])].join(':')
const member8 = orgMember('test_user8', 'user')
const member5 = orgMember('test_user5', 'contrib')
const member6 = orgMember('test_user6', 'contrib', 'dep1')
const member1 = orgMember('test_user1', 'admin')
const asMember = (visitor: string, extraParams: Record<string, string> = {}) =>
  ({ params: { asVisitor: visitor, ...extraParams } })

test.describe('asVisitor list override', () => {
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

    // the forced org scope composes as AND with other filter params: an owner param pointing
    // outside the org cannot widen it...
    res = await orgAdmin.get('/api/v1/datasets', asMember(member8, { owner: 'user:test_user3' }))
    assert.equal(res.data.count, 0)
    // ...neither can shared=true (same count as without the param)
    res = await orgAdmin.get('/api/v1/datasets', asMember(member8, { shared: 'true' }))
    assert.equal(res.data.count, 2)
  })

  test('asVisitor is restricted to org admins', async () => {
    await assert.rejects(orgContrib.get('/api/v1/datasets', asMember(member8)), { status: 403 })
    await assert.rejects(user1Personal.get('/api/v1/datasets', asMember(member8)), { status: 403 })
    await assert.rejects(anonymous.get('/api/v1/datasets', asMember(member8)), { status: 401 })
    await assert.rejects(orgAdmin.get('/api/v1/datasets', { params: { asVisitor: 'unknown' } }), { status: 400 })
    await assert.rejects(orgAdmin.get('/api/v1/datasets', { params: { asVisitor: 'member:x' } }), { status: 400 })
    await assert.rejects(orgAdmin.get('/api/v1/datasets?asVisitor=anonymous&asVisitor=connected'), { status: 400 })
  })

  test('asVisitor responses are never publicly cacheable', async () => {
    // select=-userPermissions + visibility=public would otherwise mark the list public for the reverse proxy
    const res = await orgAdmin.get('/api/v1/datasets', asMember(member8, { select: '-userPermissions', visibility: 'public' }))
    const cacheControl = String(res.headers['cache-control'] ?? '')
    assert.ok(!cacheControl.includes('public'), cacheControl)
    assert.notEqual(res.headers['x-accel-buffering'], 'yes')
  })

  test('an org API key is rejected by the gate even though it carries an admin accountRole', async () => {
    // every org API key session is minted with accountRole = adminRole regardless of its actual
    // scopes (readApiKey in api-key.ts), so the gate must reject isApiKey sessions explicitly
    const res = await orgAdmin.put('/api/v1/settings/organization/test_org1', {
      apiKeys: [{ title: 'audit key', scopes: ['datasets'] }]
    })
    const apiKey = axios({ headers: { 'x-apiKey': res.data.apiKeys[0].clearKey } })
    await assert.rejects(apiKey.get('/api/v1/datasets', asMember(member8)), (err: any) => {
      assert.equal(err.status, 403)
      assert.ok(err.data.includes('n\'est pas utilisable avec une clé d\'API'))
      return true
    })
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

  test('org admin lists applications as another member', async () => {
    const appA = (await orgAdmin.post('/api/v1/applications', { title: 'audit app a', url: mockAppUrl('monapp1') })).data
    await orgAdmin.put(`/api/v1/applications/${appA.id}/permissions`, [{ type: 'user', id: 'test_user8', classes: ['list', 'read'] }])
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- appB only needs to exist for the facet-count assertion below
    const appB = (await orgAdmin.post('/api/v1/applications', { title: 'audit app b', url: mockAppUrl('monapp1') })).data
    // public noise from another account, excluded by the forced org scope
    const appPub = (await user3.post('/api/v1/applications', { title: 'audit app public', url: mockAppUrl('monapp1') })).data
    await user3.put(`/api/v1/applications/${appPub.id}/permissions`, [{ operations: ['readDescription', 'list'] }])

    let res = await orgAdmin.get('/api/v1/applications', asMember(member8))
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, appA.id)
    assert.ok(res.data.results[0].userPermissions.includes('readDescription'))
    assert.ok(!res.data.results[0].userPermissions.includes('writeDescription'))

    // facets stay inside the forced org scope (appB + appA, the public external app is not counted)
    res = await orgAdmin.get('/api/v1/applications', asMember(member1, { facets: 'visibility' }))
    const totalFacet = res.data.facets.visibility.reduce((sum: number, f: any) => sum + f.count, 0)
    assert.equal(totalFacet, 2)

    // gate applies on applications too
    await assert.rejects(orgContrib.get('/api/v1/applications', asMember(member8)), { status: 403 })
  })
  test('org admin lists datasets as hypothetical visitors', async () => {
    const dsPublic = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor public' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsPublic.id}/permissions`, [{ classes: ['list', 'read'] }])
    const dsConnected = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor connected' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsConnected.id}/permissions`, [{ type: 'user', id: '*', classes: ['list'] }])
    const dsEmail = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor email' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsEmail.id}/permissions`, [{ type: 'user', email: 'someone@external.com', classes: ['list', 'read'] }])
    const dsPartner = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor partner' })).data
    await orgAdmin.put(`/api/v1/datasets/${dsPartner.id}/permissions`, [{ type: 'organization', id: 'test_org2', classes: ['list', 'read'] }])
    // default permissions: org contribs can list/read/write
    const dsContrib = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor contrib' })).data
    // public noise outside the forced org scope
    const dsExternal = (await user3.post('/api/v1/datasets', { isRest: true, title: 'visitor external' })).data
    await user3.put(`/api/v1/datasets/${dsExternal.id}/permissions`, [{ classes: ['list', 'read'] }])

    const listIds = async (visitor: string, extraParams: Record<string, string> = {}) =>
      (await orgAdmin.get('/api/v1/datasets', asMember(visitor, extraParams))).data.results.map((r: any) => r.id).sort()

    // anonymous
    assert.deepEqual(await listIds('anonymous'), [dsPublic.id])
    // any authenticated user
    assert.deepEqual(await listIds('connected'), [dsPublic.id, dsConnected.id].sort())
    // a user designated by email
    assert.deepEqual(await listIds('email:someone@external.com'), [dsPublic.id, dsConnected.id, dsEmail.id].sort())
    // a member of a partner organization
    assert.deepEqual(await listIds('partner:test_org2'), [dsPublic.id, dsConnected.id, dsPartner.id].sort())
    // any member of the org with a role
    assert.deepEqual(await listIds('role:contrib'), [dsPublic.id, dsConnected.id, dsContrib.id].sort())
    assert.equal((await listIds('role:admin')).length, 5)

    // can= works for an anonymous visitor too (no user in the synthetic session)
    assert.deepEqual(await listIds('anonymous', { can: 'read' }), [dsPublic.id])
    assert.deepEqual(await listIds('connected', { can: 'read' }), [dsPublic.id])
    // ...and so it does for a real anonymous caller (filterCan used to return an empty $or)
    const anonRes = await anonymous.get('/api/v1/datasets', { params: { can: 'read', owner: 'organization:test_org1' } })
    assert.deepEqual(anonRes.data.results.map((r: any) => r.id), [dsPublic.id])
  })

  test('each listed resource tells why the visitor reaches it', async () => {
    const ds = (await orgAdmin.post('/api/v1/datasets', { isRest: true, title: 'visitor sources' })).data
    await orgAdmin.put(`/api/v1/datasets/${ds.id}/permissions`, [
      { classes: ['list'] },
      { type: 'user', id: 'test_user8', classes: ['read'] },
      { type: 'organization', id: 'test_org1', roles: ['contrib'], classes: ['write'] }
    ])

    let res = await orgAdmin.get('/api/v1/datasets', asMember(member8))
    let sources = res.data.results.find((r: any) => r.id === ds.id).accessSources
    assert.equal(sources.ownerRole, undefined)
    assert.deepEqual(sources.ownerClasses, [])
    assert.deepEqual(sources.permissions.map((p: any) => p.classes[0]), ['list', 'read'])
    // the full permissions array is still not exposed
    assert.equal(res.data.results[0].permissions, undefined)

    res = await orgAdmin.get('/api/v1/datasets', asMember(member1))
    sources = res.data.results.find((r: any) => r.id === ds.id).accessSources
    assert.equal(sources.ownerRole, 'admin')
    assert.ok(sources.ownerClasses.includes('admin'))
    // the permission restricted to contribs is not presented as a reason of an admin's access
    assert.deepEqual(sources.permissions.map((p: any) => p.classes[0]), ['list'])
    // the same holds for a role visitor
    res = await orgAdmin.get('/api/v1/datasets', asMember('role:admin'))
    sources = res.data.results.find((r: any) => r.id === ds.id).accessSources
    assert.deepEqual(sources.permissions.map((p: any) => p.classes[0]), ['list'])
    // ...while a contrib does get it
    res = await orgAdmin.get('/api/v1/datasets', asMember('role:contrib'))
    sources = res.data.results.find((r: any) => r.id === ds.id).accessSources
    assert.deepEqual(sources.permissions.map((p: any) => p.classes[0]), ['list', 'write'])

    // absent outside of the audit mode
    res = await orgAdmin.get('/api/v1/datasets')
    assert.equal(res.data.results.find((r: any) => r.id === ds.id).accessSources, undefined)

    const app = (await orgAdmin.post('/api/v1/applications', { title: 'visitor app sources', url: mockAppUrl('monapp1') })).data
    await orgAdmin.put(`/api/v1/applications/${app.id}/permissions`, [{ classes: ['list', 'read'] }])
    res = await orgAdmin.get('/api/v1/applications', asMember('anonymous'))
    assert.deepEqual(res.data.results[0].accessSources.permissions, [{ classes: ['list', 'read'] }])
  })
})
