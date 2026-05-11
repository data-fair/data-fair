import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, setConfig, clearRateLimiting } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// time-weighted ("compute budget") rate limiting: a request is billed the wall-clock duration of the
// Elasticsearch queries it ran; once a client's budget for the window is spent it gets 429.
// We set the user budget tiny (sub-millisecond) so that a single ES query — even a fast one on a small
// test dataset — exhausts it.
test.describe('compute budget rate limiting', () => {
  test.beforeAll(async () => {
    await setConfig('defaultLimits.apiRate.user.computeMs', 0.001)
  })
  test.afterAll(async () => {
    await setConfig('defaultLimits.apiRate.user.computeMs', 0) // back to the dev default (disabled)
    await clearRateLimiting()
  })
  test.beforeEach(async () => {
    await clean()
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('an Elasticsearch query exhausts the budget and the next request is rejected with 429', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax) // already waits for finalize
    await clearRateLimiting() // start this client with a fresh, full budget

    // first /lines call: served; its ES query then debits well over 1 ms when the response closes
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    await sleep(300) // let the server-side 'close' handler run the debit before the next call

    // second call hits a /lines endpoint asking for an exact count -> 429 + the count advice
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { validateStatus: () => true })
    assert.equal(res.status, 429)
    assert.match(String(res.data), /traitement|processing/) // the base exceedComputeBudget message
    assert.match(String(res.data), /count=false|count=estimate/) // the appended query advice
  })

  test('the appended advice reflects the request: no count advice when count=false is already set', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await clearRateLimiting()

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?count=false`)
    assert.equal(res.status, 200)
    await sleep(300)

    // budget spent -> still 429, still the base message, but no "count=false" advice this time
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?count=false`, { validateStatus: () => true })
    assert.equal(res.status, 429)
    assert.match(String(res.data), /traitement|processing/)
    assert.doesNotMatch(String(res.data), /count=false|count=estimate/)
  })

  test('a non-Elasticsearch request does not consume the compute budget', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax) // already waits for finalize
    await clearRateLimiting()

    // fetching the dataset description reads MongoDB, not Elasticsearch -> 0 ms billed
    let res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.status, 200)
    await sleep(300)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.status, 200)
  })
})
