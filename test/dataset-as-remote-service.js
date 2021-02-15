// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Remote service API', () => {
  it('should accept dataset API as a remote service API', async () => {
    const ax = global.ax.superadmin
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    dataset = (await ax.get(`api/v1/datasets/${dataset.id}`)).data
    const apiDocUrl = dataset.href + '/api-docs.json'
    const apiDoc = (await ax.get(apiDocUrl)).data

    const remoteService = (await ax.post('/api/v1/remote-services', { apiDoc, url: apiDocUrl })).data
    assert.equal(remoteService.apiDoc.info['x-api-id'], 'localhost-dataset-dataset1')
    console.log(remoteService.id)
  })
})
