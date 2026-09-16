import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, anonymousAx, clean, checkPendingTasks, config, apiUrl } from '../../support/axios.ts'
import { clearDatasetCache } from '../../support/workers.ts'

// identity webhooks are internal calls, simple-directory reaches the API directly and not through the public proxy
const identitiesUrl = `${apiUrl}/api/v1/identities`
const identitiesHeaders = { headers: { 'x-secret-key': config.secretKeys.identities } }

const u1 = await axiosAuth('test_user1@test.com')
const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const superadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('personal information storage cleanup', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('createdBy / updatedBy are stored without user name', async () => {
    const id = 'identities-cleanup-1'
    const res = await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    assert.deepEqual(res.data.createdBy, { id: 'test_user1' })
    assert.deepEqual(res.data.updatedBy, { id: 'test_user1' })
    const patched = await u1.patch('/api/v1/datasets/' + id, { description: 'desc' })
    assert.deepEqual(patched.data.updatedBy, { id: 'test_user1' })
  })

  test('identity rename syncs owner name but stores no authoring name', async () => {
    const id = 'identities-cleanup-2'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await anonymousAx.post(`${identitiesUrl}/user/test_user1`, { name: 'Renamed User1' }, identitiesHeaders)
    const res = await u1.get('/api/v1/datasets/' + id)
    assert.equal(res.data.owner.name, 'Renamed User1')
    assert.deepEqual(res.data.createdBy, { id: 'test_user1' })
    assert.deepEqual(res.data.updatedBy, { id: 'test_user1' })
  })

  test('organization update renames a department and forgets the name of a deleted one', async () => {
    const id = 'identities-cleanup-8'
    await u1Org.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, owner: { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: 'dep1' } })
    await anonymousAx.post(`${identitiesUrl}/organization/test_org1`, { name: 'Test Org 1', departments: [{ id: 'dep1', name: 'Renamed Department' }] }, identitiesHeaders)
    await clearDatasetCache()
    let dataset = (await u1Org.get('/api/v1/datasets/' + id)).data
    assert.equal(dataset.owner.departmentName, 'Renamed Department')

    // dep1 is missing from the complete list of departments: it was deleted, only its id remains
    await anonymousAx.post(`${identitiesUrl}/organization/test_org1`, { name: 'Test Org 1', departments: [{ id: 'dep2', name: 'Department 2' }] }, identitiesHeaders)
    await clearDatasetCache()
    dataset = (await u1Org.get('/api/v1/datasets/' + id)).data
    assert.equal(dataset.owner.department, 'dep1')
    assert.equal(dataset.owner.departmentName, undefined)
  })

  test('identity rename still syncs user permission entry names', async () => {
    const id = 'identities-cleanup-3'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.put(`/api/v1/datasets/${id}/permissions`, [
      { type: 'user', id: 'test_user2', name: 'Test User2', classes: ['read'] }
    ])
    await anonymousAx.post(`${identitiesUrl}/user/test_user2`, { name: 'Renamed User2' }, identitiesHeaders)
    const perms = await u1.get(`/api/v1/datasets/${id}/permissions`)
    assert.deepEqual(perms.data, [{ type: 'user', id: 'test_user2', name: 'Renamed User2', classes: ['read'] }])
  })

  test('identity report is scoped to the requested identity', async () => {
    const id = 'identities-cleanup-5'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })

    // an unknown identity owns nothing: the report must be empty, not the whole catalog
    const unknown = await anonymousAx.get(`${identitiesUrl}/user/unknown-user/report`, identitiesHeaders)
    assert.deepEqual(unknown.data.owns.map((s: any) => s.items), [[], [], []])
    assert.deepEqual(unknown.data.hasPermissions.map((s: any) => s.items), [[], [], []])
    assert.deepEqual(unknown.data.hasCreated.map((s: any) => s.items), [[], [], []])

    const known = await anonymousAx.get(`${identitiesUrl}/user/test_user1/report`, identitiesHeaders)
    const datasets = known.data.owns.find((s: any) => s.collection === 'Jeux de données')
    assert.deepEqual(datasets.items.map((i: any) => i.title), [id])
  })

  test('organization update withdraws permissions granted to former partners', async () => {
    const id = 'identities-cleanup-6'
    await u1Org.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    const permissions = [
      { type: 'organization', id: 'test_org2', name: 'Test Org 2', classes: ['read'] },
      { type: 'organization', id: 'test_org3', name: 'Test Org 3', classes: ['read'] },
      { type: 'user', id: 'test_user2', classes: ['read'] }
    ]
    await u1Org.put(`/api/v1/datasets/${id}/permissions`, permissions)

    // an older simple-directory does not send partners: nothing is withdrawn
    await anonymousAx.post(`${identitiesUrl}/organization/test_org1`, { name: 'Test Org 1' }, identitiesHeaders)
    assert.deepEqual((await u1Org.get(`/api/v1/datasets/${id}/permissions`)).data, permissions)

    // test_org3 is no longer a partner, test_org2 still is, the user permission is not concerned
    await anonymousAx.post(`${identitiesUrl}/organization/test_org1`, { name: 'Test Org 1', partners: [{ id: 'test_org2', name: 'Test Org 2' }] }, identitiesHeaders)
    assert.deepEqual((await u1Org.get(`/api/v1/datasets/${id}/permissions`)).data, [permissions[0], permissions[2]])
  })

  test('organization rename, partnership end and delete are reflected in master data shares', async () => {
    const id = 'identities-cleanup-7'
    // a master data dataset: its shares are mirrored in the privateAccess of a remote service
    await u1Org.put('/api/v1/datasets/' + id, { isRest: true, title: id, schema: [{ key: 'code', type: 'string' }], masterData: { virtualDatasets: { active: true } } })
    await u1Org.patch('/api/v1/datasets/' + id, { masterData: { virtualDatasets: { active: true }, shareOrgs: [{ id: 'test_org2', name: 'Test Org 2' }, { id: 'test_org3', name: 'Test Org 3' }] } })
    // identity webhooks do not bump updatedAt, the memoized dataset must be dropped to read the change
    const shareOrgs = async () => {
      await clearDatasetCache()
      return (await u1Org.get('/api/v1/datasets/' + id)).data.masterData.shareOrgs
    }
    const privateAccess = async () => {
      const remoteService = (await superadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data
      return remoteService.privateAccess.map((p: any) => p.id)
    }
    assert.deepEqual(await privateAccess(), ['test_org1', 'test_org2', 'test_org3'])

    await anonymousAx.post(`${identitiesUrl}/organization/test_org2`, { name: 'Renamed Org 2' }, identitiesHeaders)
    assert.deepEqual(await shareOrgs(), [{ id: 'test_org2', name: 'Renamed Org 2' }, { id: 'test_org3', name: 'Test Org 3' }])

    // test_org3 is no longer a partner of test_org1, it loses the share and the access to the remote service
    await anonymousAx.post(`${identitiesUrl}/organization/test_org1`, { name: 'Test Org 1', partners: [{ id: 'test_org2', name: 'Renamed Org 2' }] }, identitiesHeaders)
    assert.deepEqual(await shareOrgs(), [{ id: 'test_org2', name: 'Renamed Org 2' }])
    assert.deepEqual(await privateAccess(), ['test_org1', 'test_org2'])

    await anonymousAx.delete(`${identitiesUrl}/organization/test_org2`, identitiesHeaders)
    assert.deepEqual(await shareOrgs(), [])
    assert.deepEqual(await privateAccess(), ['test_org1'])
  })

  test('identity delete removes permission entries', async () => {
    const id = 'identities-cleanup-4'
    await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id })
    await u1.put(`/api/v1/datasets/${id}/permissions`, [
      { type: 'user', id: 'test_user2', classes: ['read'] }
    ])
    await anonymousAx.delete(`${identitiesUrl}/user/test_user2`, identitiesHeaders)
    const perms = await u1.get(`/api/v1/datasets/${id}/permissions`)
    assert.deepEqual(perms.data, [])
  })
})
