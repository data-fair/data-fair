// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const initVirtualMaster = async (ax: any, schema: any, id = 'master') => {
  await ax.put('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema,
    masterData: {
      virtualDatasets: { active: true }
    }
  })
  const master = (await ax.get('/api/v1/datasets/' + id)).data

  await ax.put(`/api/v1/datasets/${master.id}/permissions`, [{ classes: ['read'] }])

  const apiDocUrl = master.href + '/api-docs.json'
  const apiDoc = (await ax.get(apiDocUrl)).data

  const remoteService = (await testSuperadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

test.describe('master data - Master-data interaction with virtual datasets', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('virtual master-data management should define and use a dataset as master-data child for virtual dataset', async () => {
    const ax = testSuperadmin

    const { remoteService } = await initVirtualMaster(
      ax,
      [{ key: 'str1', type: 'string' }]
    )
    assert.equal(remoteService.virtualDatasets.parent.id, 'master')

    await testSuperadmin.patch(`/api/v1/remote-services/${remoteService.id}`, { virtualDatasets: { ...remoteService.virtualDatasets, storageRatio: 0.5 } })

    const remoteServices = (await testSuperadmin.get('/api/v1/remote-services', { params: { showAll: true, 'virtual-datasets': true } })).data
    assert.equal(remoteServices.count, 1)
    assert.equal(remoteServices.results[0].virtualDatasets.parent.id, 'master')

    await ax.post('/api/v1/datasets/master/_bulk_lines', [
      { str1: 'LINE1' },
      { str1: 'LINE2' },
      { str1: 'LINE3' },
      { str1: 'LINE4' }
    ])
    const master = await waitForFinalize(ax, 'master')

    const res = await testUser1.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: ['master']
      },
      title: 'a virtual dataset'
    })
    const virtualDataset = await waitForFinalize(testUser1, res.data.id)
    assert.equal(virtualDataset.storage.size, 0)
    assert.ok(virtualDataset.storage.indexed.size > 0)
    assert.equal(virtualDataset.storage.indexed.size, Math.round(master.storage.indexed.size / 2))
  })
})
