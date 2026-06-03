import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl } from '../../support/axios.ts'

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

  test('cannot write notifiedJ3At from the api', async () => {
    await assert.rejects(
      testUser1.put('/api/v1/settings/user/test_user1', {
        apiKeys: [{
          title: 'k2',
          scopes: ['datasets-read'],
          expireAt: dayjs().add(1, 'year').format('YYYY-MM-DD'),
          notifiedJ3At: '2026-05-20T00:00:00.000Z'
        }]
      }),
      (err: any) => err.status === 400
    )
  })

  test('notifiedJ3At / notifiedJAt are not returned in the API response', async () => {
    // Create an API key
    await testUser1.put('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'k1', scopes: ['datasets-read'], expireAt: dayjs().add(1, 'year').format('YYYY-MM-DD') }]
    })

    // Write the internal flags directly to mongo (simulating what the worker does)
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/settings-update-one`, {
      filter: { type: 'user', id: 'test_user1' },
      update: { $set: { 'apiKeys.0.notifiedJ3At': '2026-05-20T00:00:00.000Z' } }
    })

    // Read via the API
    const res = await testUser1.get('/api/v1/settings/user/test_user1')
    assert.equal(res.status, 200)
    assert.ok(res.data.apiKeys?.[0], 'apiKey present')
    assert.equal(res.data.apiKeys[0].notifiedJ3At, undefined, 'notifiedJ3At not exposed')
    assert.equal(res.data.apiKeys[0].notifiedJAt, undefined, 'notifiedJAt not exposed')
  })

  test('can still re-save settings after the worker set an expiration flag on a key', async () => {
    // create a key
    const created = (await testUser1.put('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'k-flag', scopes: ['datasets-read'], expireAt: dayjs().add(10, 'day').format('YYYY-MM-DD') }]
    })).data
    const key = created.apiKeys.find((k: any) => k.title === 'k-flag')
    assert.ok(key?.id)

    // simulate the expiration worker having set the internal flag directly in mongo
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/settings-update-one`, {
      filter: { type: 'user', id: 'test_user1' },
      update: { $set: { 'apiKeys.0.notifiedJ3At': '2026-05-20T00:00:00.000Z' } }
    })

    // re-read (flags are stripped) and re-save the same settings — must NOT 400 'immutable'
    const reread = (await testUser1.get('/api/v1/settings/user/test_user1')).data
    assert.equal(reread.apiKeys[0].notifiedJ3At, undefined)
    const resave = await testUser1.put('/api/v1/settings/user/test_user1', { apiKeys: reread.apiKeys })
    assert.equal(resave.status, 200)
  })
})
