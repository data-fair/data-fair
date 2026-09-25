import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')
const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')

test.describe('trim free-text metadata on write', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('dataset creation and patch', async () => {
    const res = await u1.post('/api/v1/datasets/trim-1', { isMetaOnly: true, title: ' Trim ', summary: ' sum ' })
    assert.equal(res.data.title, 'Trim')
    assert.equal(res.data.summary, 'sum')
    const patched = await u1.patch('/api/v1/datasets/trim-1', { keywords: [' a ', 'a', ' '], creator: ' me ' })
    assert.deepEqual(patched.data.keywords, ['a'])
    assert.equal(patched.data.creator, 'me')
  })

  test('application creation and patch', async () => {
    const res = await u1.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: ' App ', summary: ' sum ' })
    assert.equal(res.data.title, 'App')
    assert.equal(res.data.summary, 'sum')
    const patched = await u1.patch('/api/v1/applications/' + res.data.id, { description: ' desc ' })
    assert.equal(patched.data.description, 'desc')
  })

  test('settings write', async () => {
    await u1Org.put('/api/v1/settings/organization/test_org1', { topics: [{ id: 'topic1', title: ' Topic 1 ' }] })
    const res = await u1Org.get('/api/v1/settings/organization/test_org1')
    assert.deepEqual(res.data.topics, [{ id: 'topic1', title: 'Topic 1' }])
  })
})
