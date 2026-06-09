import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, setConfig, clearRateLimiting } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Regression test for middleware ordering: rate-limiting (`rateLimiting.middleware()`) is mounted on
// /api/v1/datasets *before* the datasets router, while API keys used to be resolved only per-route
// *inside* that router. As a result `reqUser(req)` was empty when the limiter ran, and every request
// authenticated with an API key was throttled at the `anonymous` tier instead of `user`.
//
// We make the `anonymous` compute budget so tiny a single ES query exhausts it, and disable the `user`
// budget. An API-key request that is correctly classified as `user` therefore never gets a 429; one
// wrongly classified as `anonymous` gets a 429 on its second /lines call.
test.describe('API key rate limiting tier', () => {
  test.beforeAll(async () => {
    await setConfig('defaultLimits.apiRate.anonymous.computeMs', 0.001) // exhausted by one ES query
    await setConfig('defaultLimits.apiRate.user.computeMs', 0) // disabled
  })
  test.afterAll(async () => {
    await setConfig('defaultLimits.apiRate.anonymous.computeMs', 0) // back to the dev/test default
    await clearRateLimiting()
  })
  test.beforeEach(async () => {
    await clean()
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a request authenticated with an API key is rate-limited as a user, not anonymous', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1)

    // a datasets-scoped API key for the owner of the dataset
    const res = await testUser1.put('/api/v1/settings/user/test_user1', {
      apiKeys: [{ title: 'rl-key', scopes: ['datasets'] }]
    })
    const key = res.data.apiKeys[0].clearKey
    const axKey = axios({ headers: { 'x-apiKey': key } })

    await clearRateLimiting() // start every tier with a fresh, full budget

    // first /lines call via the API key: served; its ES query debits >0.001 ms on response close
    let r = await axKey.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(r.status, 200)
    await sleep(300) // let the server-side 'close' handler run the debit before the next call

    // second call: if the API key were (wrongly) classified as anonymous, the tiny anonymous budget
    // would now be exhausted -> 429. Classified as a user (budget disabled) it must still be 200.
    r = await axKey.get(`/api/v1/datasets/${dataset.id}/lines`, { validateStatus: () => true })
    assert.equal(r.status, 200)
  })
})
