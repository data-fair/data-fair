import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')

// two lines: 'aaa'(3)+'1'(1) and 'bébé'(6)+'22'(2), 2 columns -> +2 each
// expected indexed size = (3+1+2) + (6+2+2) = 16
const csvContent = 'str1,int1\naaa,1\nbébé,22\n'
const expectedBytes = 16

test.describe('storage line-bytes accounting', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('file and REST datasets count the same payload identically', async () => {
    // file dataset from inline content (same FormData pattern as limits.api.spec.ts)
    const form = new FormData()
    form.append('file', Buffer.from(csvContent), 'lines.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const fileDataset = await waitForFinalize(ax, res.data.id)

    assert.deepEqual(fileDataset.storage.indexed.parts, ['lines'])
    assert.equal(fileDataset.storage.indexed.size, expectedBytes)

    // _bytes is internal: it must not leak into line responses
    res = await ax.get(`/api/v1/datasets/${fileDataset.id}/lines`)
    assert.equal(res.data.results[0]._bytes, undefined)

    // REST dataset with the same payload
    res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest line bytes',
      schema: [{ key: 'str1', type: 'string' }, { key: 'int1', type: 'integer' }]
    })
    const restId = res.data.id
    // empty REST dataset creation is synchronous (finalized already in the response);
    // waiting here would race the (possibly already-fired) finalize-end event
    await ax.post(`/api/v1/datasets/${restId}/_bulk_lines`, [
      { str1: 'aaa', int1: 1 },
      { str1: 'bébé', int1: 22 }
    ])
    const restDataset = await waitForFinalize(ax, restId)

    assert.deepEqual(restDataset.storage.indexed.parts, ['lines'])
    assert.equal(restDataset.storage.indexed.size, expectedBytes)
  })

  test('REST updates and deletes track the indexed size', async () => {
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest line bytes tracking',
      schema: [{ key: 'str1', type: 'string' }]
    })
    const id = res.data.id
    // empty REST dataset creation is synchronous (finalized already in the response);
    // waiting here would race the (possibly already-fired) finalize-end event
    res = await ax.post(`/api/v1/datasets/${id}/lines`, { str1: 'aaa' })
    const lineId = res.data._id
    await waitForFinalize(ax, id)
    // 'aaa'(3) + 1 separator
    let dataset = (await ax.get(`/api/v1/datasets/${id}`)).data
    assert.equal(dataset.storage.indexed.size, 4)

    // grow the value by 3 bytes
    await ax.put(`/api/v1/datasets/${id}/lines/${lineId}`, { str1: 'aaaaaa' })
    await waitForFinalize(ax, id)
    dataset = (await ax.get(`/api/v1/datasets/${id}`)).data
    assert.equal(dataset.storage.indexed.size, 7)

    await ax.delete(`/api/v1/datasets/${id}/lines/${lineId}`)
    await waitForFinalize(ax, id)
    dataset = (await ax.get(`/api/v1/datasets/${id}`)).data
    // no lines left -> the sum aggregation is 0
    assert.equal(dataset.storage.indexed.size, 0)
  })
})
