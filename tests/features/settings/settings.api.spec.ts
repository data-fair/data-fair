import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const dmeadusOrg = await axiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const hlalonde3Org = await axiosAuth('hlalonde3@desdev.cn', 'passwd', 'KWqAGZ4mG')

test.describe('settings API', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should reject wrong account type', async () => {
    await assert.rejects(
      dmeadus.get('/api/v1/settings/unknown/dmeadus0'),
      { status: 400 }
    )
  })

  test('should reject anonymous request', async () => {
    await assert.rejects(
      dmeadus.get('/api/v1/settings/user/hlalonde3'),
      { status: 403 }
    )
  })

  test('should read user empty settings', async () => {
    const res = await dmeadus.get('/api/v1/settings/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  test('should reject update with wrong format', async () => {
    await assert.rejects(
      dmeadus.put('/api/v1/settings/user/dmeadus0', { forbiddenKey: 'not allowed' }),
      { status: 400 }
    )
  })

  test('should read settings as organization admin', async () => {
    const res = await dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  test('should write settings as organization admin', async () => {
    await dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [{ id: 'topic1', title: 'Topic 1' }] })
    const res = await dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.topics, [{ id: 'topic1', title: 'Topic 1' }])
  })

  test('should write and read settings as organization department admin', async () => {
    await assert.rejects(hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { topics: [{ id: 'topic1', title: 'Topic 1' }] }), (err: any) => err.status === 400)
    await dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { apiKeys: [{ title: 'Api key 1', scopes: [] }] })
    const res = await hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:dep1')
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Fivechat - dep1')
    assert.equal(res.data.department, 'dep1')
    assert.deepEqual(res.data.apiKeys[0].title, 'Api key 1')
  })
})
