import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')
const testUser3 = await axiosAuth('test_user3@test.com')

test.describe('fragments listing', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('fragments are hidden by default and listed through partOf or pinned filters', async () => {
    const virtual = (await testUser1Org.post('/api/v1/datasets', { isVirtual: true, title: 'v' })).data
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    const ids = (res: any) => res.data.results.map((r: any) => r.id)

    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets')), [virtual.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets', { params: { partOf: `dataset:${virtual.id}` } })), [fragment.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets', { params: { id: fragment.id } })), [fragment.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets', { params: { ids: fragment.id } })), [fragment.id])
    // partOf=true reveals every fragment whatever its parent, partOf=false is the default
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets', { params: { partOf: 'true' } })), [fragment.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/datasets', { params: { partOf: 'false' } })), [virtual.id])
    assert.equal((await testUser1Org.get('/api/v1/datasets', { params: { size: 0 } })).data.count, 1)
    await assert.rejects(testUser1Org.get('/api/v1/datasets', { params: { partOf: 'nope' } }), { status: 400 })

    // a contributor of the parent sees the fragment through the derived ACL, an external reader of the parent does not
    assert.deepEqual(ids(await testUser5Org.get('/api/v1/datasets', { params: { partOf: `dataset:${virtual.id}` } })), [fragment.id])
    const parentPermissions = (await testUser1Org.get(`/api/v1/datasets/${virtual.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/datasets/${virtual.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    assert.deepEqual(ids(await testUser3.get('/api/v1/datasets', { params: { partOf: `dataset:${virtual.id}` } })), [])

    // applications
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const sub = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), partOf: { type: 'application', id: dashboard.id } })).data
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/applications')), [dashboard.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/applications', { params: { partOf: `application:${dashboard.id}` } })), [sub.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/applications', { params: { ids: sub.id } })), [sub.id])
    assert.deepEqual(ids(await testUser1Org.get('/api/v1/applications', { params: { partOf: 'true' } })), [sub.id])
  })
})
