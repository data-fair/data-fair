import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')   // admin of test_org1
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')   // contrib of test_org1

const createApp = async (ax = testUser1Org, body: any = {}) => (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), ...body })).data

test.describe('application fragments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create a sub-application with a derived ACL, attach and detach', async () => {
    const dashboard = await createApp()
    const sub = await createApp(testUser1Org, { title: 'sub', partOf: { type: 'application', id: dashboard.id } })
    assert.deepEqual(sub.partOf, { type: 'application', id: dashboard.id })
    let permissions = (await testUser1Org.get(`/api/v1/applications/${sub.id}/permissions`)).data
    // write+delete entry kept, and the contrib read entry is kept too (application -> application)
    assert.equal(permissions.length, 2)
    assert.deepEqual(permissions[0].classes, ['list', 'read', 'readAdvanced', 'write'])
    assert.deepEqual(permissions[1].classes, ['list', 'read'])

    // contributor can read and edit, cannot attach/detach (delete gate is admin-class on applications? no: contribs hold `delete` by default -> they CAN)
    const res = await testUser5Org.get(`/api/v1/applications/${sub.id}`)
    assert.ok(res.data.userPermissions.includes('writeDescription'))

    // PUT replace keeps partOf
    await testUser1Org.put(`/api/v1/applications/${sub.id}`, { url: mockAppUrl('monapp1'), title: 'sub renamed' })
    assert.deepEqual((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, { type: 'application', id: dashboard.id })

    // guards
    await assert.rejects(testUser1Org.patch(`/api/v1/applications/${sub.id}`, { publicationSites: [] }), { status: 400 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${sub.id}/permissions`, []), { status: 403 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${sub.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 403 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${dashboard.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 400 })

    // detach
    await testUser1Org.patch(`/api/v1/applications/${sub.id}`, { partOf: null })
    assert.equal((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, undefined)
    permissions = (await testUser1Org.get(`/api/v1/applications/${sub.id}/permissions`)).data
    assert.equal(permissions.length, 2)

    // attach an existing app
    await testUser1Org.patch(`/api/v1/applications/${sub.id}`, { partOf: { type: 'application', id: dashboard.id } })
    assert.deepEqual((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, { type: 'application', id: dashboard.id })
  })

  test('refusals: an application cannot be a fragment of a dataset', async () => {
    const virtual = (await testUser1Org.post('/api/v1/datasets', { isVirtual: true, title: 'v' })).data
    await assert.rejects(createApp(testUser1Org, { partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
  })
})
