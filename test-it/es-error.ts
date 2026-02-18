import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset } from './utils/index.ts'
import config from 'config'
import { aliasName, extractError } from '../api/src/datasets/es/commons.js'
import * as workers from '../api/src/workers/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const superadmin = await getAxiosAuth('superadmin@test.com', 'superpasswd', undefined, true)

describe('Elasticsearch errors management', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Extract simple message from a full ES error', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    // delete the elasticsearch index to create errors
    const alias = (await ax.get(`http://${config.elasticsearch.host}/${aliasName(dataset)}`)).data
    const indexName = Object.keys(alias)[0]
    await ax.delete(`http://${config.elasticsearch.host}/${indexName}`)

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

  it('Extract message from another ES error', function () {
    const { message, status } = extractError({
      error: {
        root_cause: [{ type: 'remote_transport_exception', reason: '[master5][10.0.11.177:9300][indices:admin/create]' }],
        type: 'illegal_argument_exception',
        reason: 'Validation Failed: 1: this action would add [2] total shards, but this cluster currently has [3456]/[3000] maximum shards open;'
      },
      status: 400
    })
    assert.equal(message, 'Validation Failed: 1: this action would add [2] total shards, but this cluster currently has [3456]/[3000] maximum shards open; - [master5][10.0.11.177:9300][indices:admin/create]')
    assert.equal(status, 400)
  })

  afterEach(function () {
    process.env.READ_ONLY_ES_INDEX = 'false'
  })

  it('Manage read only index error', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    // upload a new file but the index won't be writable (simulates a lock from flood watermark errors)
    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX', value: 'true' }, { name: 'setEnv' })
    await superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    // 1 auto-retry
    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    // dataset is in error, but still queryable from previous index
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)

    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX' }, { name: 'setEnv' })
  })
})
