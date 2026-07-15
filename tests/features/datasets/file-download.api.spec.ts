import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('datasets - file download', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // A HEAD on /raw must return GET's headers (Content-Length, Last-Modified) with no body, so
  // crawlers like data.gouv.fr's hydra (HEAD + 5s timeout) can read the date without hanging on
  // the throttled body stream.
  test('HEAD /raw returns headers without a body', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1)
    const res = await testUser1.head(`/api/v1/datasets/${dataset.id}/raw`)
    assert.equal(res.status, 200)
    assert.ok(Number(res.headers['content-length']) > 0)
    assert.ok(res.headers['last-modified'])
    assert.ok(!res.data)
  })
})
