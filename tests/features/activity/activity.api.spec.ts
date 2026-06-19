import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('Activity', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('returns the recently updated datasets and applications the session can read', async () => {
    await testUser1.post('/api/v1/datasets/activity-ds1', {
      isRest: true,
      title: 'activity-ds1',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    const appRes = await testUser1.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'activity-app1' })
    const appId = appRes.data.id

    const res = await testUser1.get('/api/v1/activity')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.results))

    const dataset = res.data.results.find((r: any) => r.id === 'activity-ds1')
    assert.ok(dataset, 'the owned dataset is present in the activity feed')
    assert.equal(dataset.type, 'dataset')
    assert.ok(dataset.date, 'each activity entry carries a date')

    const application = res.data.results.find((r: any) => r.id === appId)
    assert.ok(application, 'the owned application is present in the activity feed')
    assert.equal(application.type, 'application')
  })

  test('does not leak private resources of other accounts to anonymous callers', async () => {
    await testUser1.post('/api/v1/datasets/activity-private', {
      isRest: true,
      title: 'activity-private',
      schema: [{ key: 'attr1', type: 'string' }]
    })

    const res = await anonymous.get('/api/v1/activity')
    assert.equal(res.status, 200)
    assert.ok(!res.data.results.find((r: any) => r.id === 'activity-private'), 'private dataset is not exposed anonymously')
  })
})
