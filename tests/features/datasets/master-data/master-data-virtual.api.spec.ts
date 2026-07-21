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

  // Regression test for a row leak through the local master-data bulk-search path
  // (api/src/datasets/utils/master-data.ts bulkSearchStreams): a virtual dataset used as
  // master-data can itself have a virtual child that carries static `virtual.filters`. The
  // local extension path (extensions.ts reads the master dataset straight from mongo, bypassing
  // readDataset/getDataset which normally resolves `descendants` and their scoped filters)
  // must still enforce that child's filters, or rows it is meant to hide leak into extension output.
  test('static filters of an intermediate virtual child are enforced through the local master-data extension path', async () => {
    const ax = testUser1

    // the "code" field carries a concept so the extension mechanism can match it against the
    // slave's own "code" field (extensions require a shared x-refersTo concept, not just a key)
    const codeConcept = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    const codeProperty = { key: 'code', type: 'string', 'x-refersTo': codeConcept }

    // physical source with a row that must stay hidden behind the filtered virtual child
    const source = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'leak source',
      schema: [
        codeProperty,
        { key: 'category', type: 'string' },
        { key: 'label', type: 'string' }
      ]
    })).data
    await ax.post(`/api/v1/datasets/${source.id}/_bulk_lines`, [
      { code: 'A', category: 'visible', label: 'Row A' },
      { code: 'B', category: 'hidden', label: 'Row B' }
    ])
    await waitForFinalize(ax, source.id)

    // intermediate virtual child scoping out the "hidden" category via a static filter
    const filteredChild = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'filtered child',
      virtual: { children: [source.id], filters: [{ key: 'category', values: ['visible'] }] },
      schema: [{ key: 'code' }, { key: 'category' }, { key: 'label' }]
    })).data
    await waitForFinalize(ax, filteredChild.id)

    // the master-data virtual dataset, exposing a bulk-search on "code"
    const master = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'leak master',
      virtual: { children: [filteredChild.id] },
      schema: [codeProperty, { key: 'category', type: 'string' }, { key: 'label', type: 'string' }],
      masterData: {
        bulkSearchs: [{
          id: 'code',
          title: 'Fetch by code',
          description: '',
          input: [{ type: 'equals', property: codeProperty }]
        }]
      }
    })).data
    await waitForFinalize(ax, master.id)

    const remoteService = (await testSuperadmin.get('/api/v1/remote-services/dataset:' + master.id, { params: { showAll: true } })).data
    assert.ok(remoteService)

    // REST slave asking for both the visible ("A") and the hidden ("B") code
    await ax.put('/api/v1/datasets/leak-slave', {
      isRest: true,
      title: 'leak slave',
      schema: [codeProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_code',
        select: ['label']
      }]
    })
    await ax.post('/api/v1/datasets/leak-slave/_bulk_lines', [{ code: 'A' }, { code: 'B' }])
    await waitForFinalize(ax, 'leak-slave')

    const results = (await ax.get('/api/v1/datasets/leak-slave/lines')).data.results
    const rowA = results.find((r: any) => r.code === 'A')
    const rowB = results.find((r: any) => r.code === 'B')
    assert.equal(rowA['_code.label'], 'Row A')
    // "B" only exists in the source dataset behind the "hidden" category, scoped out by the
    // filtered virtual child: the bulk-search must not find it, and must never leak "Row B"
    assert.ok(!rowB['_code.label'], JSON.stringify(rowB))
    assert.ok(rowB['_code._error'], JSON.stringify(rowB))
  })
})
