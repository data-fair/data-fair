// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

const assert = require('assert').strict

const workers = require('../server/workers')

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

  await ax.put(`/api/v1/datasets/${master.id}/permissions`, [{ classes: ['read'] }])

  const apiDocUrl = master.href + '/api-docs.json'
  const apiDoc = (await ax.get(apiDocUrl)).data

  const remoteService = (await global.ax.superadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

describe('Virtual master data management', () => {
  it('should define and use a dataset as master-data child for virtual dataset', async () => {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [{ key: 'str1', type: 'string' }]
    )
    assert.equal(remoteService.virtualDatasets.parent.id, 'master')

    await global.ax.superadmin.patch(`/api/v1/remote-services/${remoteService.id}`, { virtualDatasets: { ...remoteService.virtualDatasets, storageRatio: 0.5 } })

    const remoteServices = (await global.ax.superadmin.get('/api/v1/remote-services', { params: { showAll: true, 'virtual-datasets': true } })).data
    assert.equal(remoteServices.count, 1)
    assert.equal(remoteServices.results[0].virtualDatasets.parent.id, 'master')

    await ax.post('/api/v1/datasets/master/_bulk_lines', [
      { str1: 'LINE1' },
      { str1: 'LINE2' },
      { str1: 'LINE3' },
      { str1: 'LINE4' }
    ])
    const master = await workers.hook('finalizer/master')

    const res = await global.ax.dmeadus.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: ['master']
      },
      title: 'a virtual dataset'
    })
    const virtualDataset = await workers.hook('finalizer/' + res.data.id)
    assert.equal(virtualDataset.storage.size, 0)
    assert.ok(virtualDataset.storage.indexed.size > 0)
    assert.equal(virtualDataset.storage.indexed.size, Math.round(master.storage.indexed.size / 2))
  })
})
