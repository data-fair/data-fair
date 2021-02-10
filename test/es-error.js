const assert = require('assert').strict
const config = require('config')
const testUtils = require('./resources/test-utils')
const { aliasName } = require('../server/utils/es/commons')

describe('Extensions', () => {
  it('Extend dataset using remote service', async function() {
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
      assert.equal(err.status, 500)
      assert.ok(err.data.startsWith('no such index'))
    }

    // cache headers are not filled, we do not want to store errors
    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { finalizedAt: dataset.finalizedAt } })
    } catch (err) {
      assert.equal(err.headers['cache-control'], 'no-cache')
    }
  })
})
