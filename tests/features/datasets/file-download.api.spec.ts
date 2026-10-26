import { test } from '../../fixtures/diagnostics.ts'
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

  test('a data file name with control characters is a 404, not a 500', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1)
    for (const name of ['%10', '1%10', '(']) {
      await assert.rejects(testUser1.get(`/api/v1/datasets/${dataset.id}/data-files/${name}`), (err: any) => err.status === 404, name)
    }
  })
})
