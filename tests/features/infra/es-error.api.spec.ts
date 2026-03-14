import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForJournalEvent, setupWorkerNock } from '../../support/workers.ts'

const esHost = `localhost:${process.env.ES_PORT}`
const indicesPrefix = 'dataset-development'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)

test.describe('Elasticsearch errors management', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('Extract simple message from a full ES error', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    // delete the elasticsearch index to create errors
    const esAlias = `${indicesPrefix}-${dataset.id}`
    const alias = (await ax.get(`http://${esHost}/${esAlias}`)).data
    const indexName = Object.keys(alias)[0]
    await ax.delete(`http://${esHost}/${indexName}`)

    // ES error is properly returned in a simplified message
    await assert.rejects(
      ax.get(`/api/v1/datasets/${dataset.id}/lines`),
      (err: any) => {
        assert.equal(err.status, 404)
        assert.ok(err.data.includes('no such index'))
        return true
      }
    )

    // cache headers are not filled, we do not want to store errors
    await assert.rejects(
      ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { finalizedAt: dataset.finalizedAt } }),
      (err: any) => {
        assert.equal(err.headers['cache-control'], 'no-cache')
        return true
      }
    )
  })

  test('Manage read only index error', async () => {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    // upload a new file but the index won't be writable (simulates a lock from flood watermark errors)
    await setupWorkerNock('batchProcessor', 'setEnv', { key: 'READ_ONLY_ES_INDEX', value: 'true' })
    await superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await waitForJournalEvent(dataset.id, 'error')

    // 1 auto-retry
    await waitForJournalEvent(dataset.id, 'error')

    // dataset is in error, but still queryable from previous index
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)

    await setupWorkerNock('batchProcessor', 'setEnv', { key: 'READ_ONLY_ES_INDEX' })
  })
})
