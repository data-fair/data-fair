import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, config } from './utils/index.ts'
import { aliasName, extractError } from '../api/src/datasets/es/commons.js'

describe('Elasticsearch errors management', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Extract simple message from a full ES error', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    const alias = (await ax.get(`http://${config.elasticsearch.host}/${aliasName(dataset)}`)).data
    const indexName = Object.keys(alias)[0]
    await ax.delete(`http://${config.elasticsearch.host}/${indexName}`)

    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
      assert.fail()
    } catch (err: any) {
      assert.equal(err.status, 404)
      assert.ok(err.data.includes('no such index'))
    }

    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { finalizedAt: dataset.finalizedAt } })
    } catch (err: any) {
      assert.equal(err.headers['cache-control'], 'no-cache')
    }
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
})
