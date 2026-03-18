import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')

test.describe('settings API', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should reject wrong account type', async () => {
    await assert.rejects(
      testUser1.get('/api/v1/settings/unknown/test_user1'),
      { status: 400 }
    )
  })

  test('should reject anonymous request', async () => {
    await assert.rejects(
      testUser1.get('/api/v1/settings/user/test_user4'),
      { status: 403 }
    )
  })

  test('should read user empty settings', async () => {
    const res = await testUser1.get('/api/v1/settings/user/test_user1')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  test('should reject update with wrong format', async () => {
    await assert.rejects(
      testUser1.put('/api/v1/settings/user/test_user1', { forbiddenKey: 'not allowed' }),
      { status: 400 }
    )
  })

  test('should read settings as organization admin', async () => {
    const res = await testUser1Org.get('/api/v1/settings/organization/test_org1')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  test('should write settings as organization admin', async () => {
    await testUser1Org.put('/api/v1/settings/organization/test_org1', { topics: [{ id: 'topic1', title: 'Topic 1' }] })
    const res = await testUser1Org.get('/api/v1/settings/organization/test_org1')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.topics, [{ id: 'topic1', title: 'Topic 1' }])
  })

  test('should write and read settings as organization department admin', async () => {
    await assert.rejects(testUser4Org.put('/api/v1/settings/organization/test_org1:dep1', { topics: [{ id: 'topic1', title: 'Topic 1' }] }), (err: any) => err.status === 400)
    await testUser1Org.put('/api/v1/settings/organization/test_org1:dep1', { apiKeys: [{ title: 'Api key 1', scopes: [] }] })
    const res = await testUser4Org.get('/api/v1/settings/organization/test_org1:dep1')
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Test Org 1 - dep1')
    assert.equal(res.data.department, 'dep1')
    assert.deepEqual(res.data.apiKeys[0].title, 'Api key 1')
  })
})
