const assert = require('assert').strict
const config = require('config')
const testUtils = require('./resources/test-utils')
const { aliasName, extractError } = require('../server/datasets/es/commons')

describe('Elasticsearch errors management', () => {
  it('Extract simple message from a full ES error', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    // delete the elasticsearch index to create errors
    const alias = (await ax.get(`http://${config.elasticsearch.host}/${aliasName(dataset)}`)).data
    const indexName = Object.keys(alias)[0]
    await ax.delete(`http://${config.elasticsearch.host}/${indexName}`)

    // ES error is properly returned in a simplified message
    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
      assert.ok(err.data.includes('no such index'))
    }

    // cache headers are not filled, we do not want to store errors
    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { finalizedAt: dataset.finalizedAt } })
    } catch (err) {
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
