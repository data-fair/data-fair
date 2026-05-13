import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// These tests exercise the `?hint=auto|true|false` query parameter on the dataset search endpoints.
// They focus on the wiring (param parsing, mode gating, body attachment); the rule-by-rule logic
// is covered by the pure unit tests in tests/features/infra/query-advice.unit.spec.ts.

test.describe('search - hint', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('hint=true attaches a hint string when a rule applies (default /lines triggers the count rule)', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?hint=true`)
    assert.equal(res.status, 200)
    assert.equal(typeof res.data.hint, 'string')
    assert.ok(res.data.hint.length > 0)
    // hint should not start with a leading space — the helper trims the raw queryAdvice output
    assert.notEqual(res.data.hint[0], ' ')
    // hint should be the first key in the JSON response so it's immediately visible
    assert.equal(Object.keys(res.data)[0], 'hint')
  })

  test('hint=false suppresses the hint even when a rule applies', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?hint=false`)
    assert.equal(res.status, 200)
    assert.equal('hint' in res.data, false)
  })

  test('hint defaults to auto and omits the hint on a fast query', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    // 2-row dataset — ES search will be far under the 1000ms slow-request threshold
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal('hint' in res.data, false)
  })

  test('hint=true returns no hint field when no rule fires', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    // count=false silences the count rule; the dataset is narrow and pagination is shallow so no
    // other rule fires either
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?hint=true&count=false`)
    assert.equal(res.status, 200)
    assert.equal('hint' in res.data, false)
  })

  test('hint=true on /values_agg attaches a hint when a values_agg rule fires', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    // agg_size>=100 trips the aggSize rule
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&agg_size=100&hint=true`)
    assert.equal(res.status, 200)
    assert.equal(typeof res.data.hint, 'string')
    assert.ok(res.data.hint.length > 0)
  })
})
