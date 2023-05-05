// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

const assert = require('assert').strict

const workers = require('../server/workers')
const testUtils = require('./resources/test-utils')

const initMaster = async (ax, schema, id = 'master') => {
  await ax.put('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema,
    masterData: {
      virtualDatasets: { active: true }
    }
  })
  await workers.hook('finalizer/' + id)
  const master = (await ax.get('api/v1/datasets/' + id)).data

  const apiDocUrl = master.href + '/api-docs.json'
  const apiDoc = (await ax.get(apiDocUrl)).data

  const remoteService = (await global.ax.superadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

describe('Master data management', () => {
  it('should define and use a dataset as master-data remote-service used for extensions', async () => {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [{ key: 'str1', type: 'string' }]
    )
    assert.equal(remoteService.virtualDatasets.parent.id, 'master')

    const remoteServices = (await global.ax.superadmin.get('/api/v1/remote-services', { params: { showAll: true, 'virtual-datasets': true } })).data
    assert.equal(remoteServices.count, 1)
    assert.equal(remoteServices.results[0].virtualDatasets.parent.id, 'master')
  })
})
