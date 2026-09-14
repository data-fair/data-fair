import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, directoryUrl, mockAppUrl } from '../../../support/axios.ts'
import { waitForFinalize, clearRateLimiting, clearDatasetCache, getRawDataset, patchRawDataset, datasetEsMappingProperties } from '../../../support/workers.ts'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

// 6.18.0 started stamping `_bytes` on every indexed line, but an index built by an older release
// has a strict mapping without it: every single-line write into such an index was rejected by
// elasticsearch with a per-item error that the bulk stream only memorized -> HTTP 200, line marked
// as indexed in mongo, line stale or missing in /lines. The stamp is now gated on `_esLineBytes`
// (set only when the current index was built by stamping code) and a rejection is loud.
test.describe('REST datasets - writes into an index built by an older release', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const createDataset = async (id: string) => {
    await testUser1.put(`/api/v1/datasets/${id}`, {
      isRest: true,
      title: id,
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const res = await testUser1.post(`/api/v1/datasets/${id}/lines`, { attr1: 'key1', attr2: 'initial' })
    await waitForFinalize(testUser1, id)
    return res.data._id as string
  }

  // model a dataset whose index was built before 6.18.0: no _bytes in the (strict) mapping, no marker
  const makeLegacy = async (id: string, keepMarker = false) => {
    await anonymous.post(`/api/v1/test-env/es-strip-mapping-field/${id}`, { field: '_bytes' })
    assert.equal((await datasetEsMappingProperties(id))._bytes, undefined)
    if (!keepMarker) {
      await patchRawDataset(id, { $unset: { _esLineBytes: 1 } })
      await clearDatasetCache()
    }
  }

  test('single-line writes are indexed without _bytes (the production regression)', async () => {
    const ax = testUser1
    const lineId = await createDataset('restlegacy')
    await makeLegacy('restlegacy')

    let res = await ax.patch(`/api/v1/datasets/restlegacy/lines/${lineId}`, { attr2: 'patched' })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/datasets/restlegacy/lines')
    assert.equal(res.data.results[0].attr2, 'patched')
    await waitForFinalize(ax, 'restlegacy')

    // anonymous patch through an application key, as in the production report
    res = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const appId = res.data.id
    await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/restlegacy`,
        applicationKeyPermissions: { operations: ['createLine', 'patchLine', 'readLines'] }
      }]
    })
    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    const anonymousToken = (await anonymous.get(directoryUrl + '/api/auth/anonymous-action')).data
    await clearRateLimiting()
    await new Promise(resolve => setTimeout(resolve, 2000))
    const headers = { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken }
    res = await anonymous.post('/api/v1/datasets/restlegacy/lines', { _action: 'patch', _id: lineId, attr2: 'anon-patched' }, { headers })
    assert.equal(res.status, 200)
    res = await anonymous.get('/api/v1/datasets/restlegacy/lines', { headers })
    assert.equal(res.data.results[0].attr2, 'anon-patched')
    await waitForFinalize(ax, 'restlegacy')

    // a bulk write goes through the worker's partial sync of the same index
    res = await ax.post('/api/v1/datasets/restlegacy/_bulk_lines', [{ attr1: 'key1', attr2: 'bulk-patched' }, { attr1: 'key2', attr2: 'created' }])
    assert.equal(res.data.nbOk, 2)
    await waitForFinalize(ax, 'restlegacy')
    res = await ax.get('/api/v1/datasets/restlegacy/lines', { params: { sort: 'attr1' } })
    assert.deepEqual(res.data.results.map((r: any) => r.attr2), ['bulk-patched', 'created'])
  })

  test('a line the index rejects is not silently dropped', async () => {
    const ax = testUser1
    const lineId = await createDataset('restrejected')
    // the marker outlived its index (rolling-deploy caveat in storage-accounting.md)
    await makeLegacy('restrejected', true)

    // the write is stored in mongo but cannot be indexed: the client must not get a 200
    await assert.rejects(ax.patch(`/api/v1/datasets/restrejected/lines/${lineId}`, { attr2: 'patched' }), (err: any) => err.status === 500 && err.data.includes('_bytes'))
    let res = await anonymous.get('/api/v1/test-env/rest-collection-find-one/restrejected', { params: { filter: JSON.stringify({ _id: lineId }) } })
    assert.equal(res.data.attr2, 'patched')
    assert.equal(res.data._needsIndexing, true, 'the line must stay flagged for indexing')
    // reported in the journal, the dataset itself is untouched
    res = await ax.get('/api/v1/datasets/restrejected/journal')
    assert.ok(res.data.find((e: any) => e.type === 'error' && e.data.includes('_bytes')), 'journal error expected')
    assert.equal((await getRawDataset('restrejected')).status, 'finalized')
    res = await ax.get('/api/v1/datasets/restrejected/lines')
    assert.equal(res.data.results[0].attr2, 'initial')

    // a full reindex rebuilds an index that maps the field and picks the flagged line up
    await testSuperadmin.post('/api/v1/datasets/restrejected/_reindex')
    await waitForFinalize(ax, 'restrejected')
    res = await ax.get('/api/v1/datasets/restrejected/lines')
    assert.equal(res.data.results[0].attr2, 'patched')
    res = await anonymous.get('/api/v1/test-env/rest-collection-find-one/restrejected', { params: { filter: JSON.stringify({ _id: lineId }) } })
    assert.equal(res.data._needsIndexing, undefined)
  })
})
