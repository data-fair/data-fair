import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { restCollectionCount, setupMockRoute, clearMockRoutes, setConfig, lsAttachments } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const baseRestDataset = {
  isRest: true,
  title: 'rest-with-mandatory',
  schema: [
    { key: 'adr', type: 'string', 'x-refersTo': 'http://schema.org/address' }
  ]
}

test.describe('mandatory remoteService — REST dataset', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('single-line POST is rejected and not persisted when mandatory remoteService fails', async () => {
    // mock geocoder to return an error per row
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    const ds = (await testUser1.post('/api/v1/datasets', {
      ...baseRestDataset,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })).data
    assert.equal(ds.status, 'finalized')

    const res = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { adr: 'somewhere' }, { validateStatus: () => true })
    assert.equal(res.status, 400)
    assert.match(JSON.stringify(res.data), /enrichissement obligatoire/)

    // nothing in MongoDB
    const count = await restCollectionCount(ds.id)
    assert.equal(count, 0)
  })

  test('single-line POST succeeds when mandatory remoteService returns no error', async () => {
    // mock geocoder to succeed (no error key)
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { lat: 10, lon: 20, matchLevel: 'match' } }
    })

    const ds = (await testUser1.post('/api/v1/datasets', {
      ...baseRestDataset,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })).data
    assert.equal(ds.status, 'finalized')

    const res = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { adr: 'somewhere' })
    assert.equal(res.status, 201)

    const count = await restCollectionCount(ds.id)
    assert.equal(count, 1)
  })

  test('bulk write is rejected up-front when oversize and a mandatory remoteService is configured', async () => {
    // lower the threshold so we can trigger the oversize path without sending megabytes
    await setConfig('elasticsearch.maxBulkChars', 200)
    try {
      // mock so the dataset can be created without errors (extension config check uses
      // the remote service definition, not actual calls)
      await setupMockRoute({
        path: '/geocoder/coords',
        ndjsonEcho: { fields: { lat: 1, lon: 1, matchLevel: 'match' } }
      })
      const ds = (await testUser1.post('/api/v1/datasets', {
        ...baseRestDataset,
        title: 'rest-bulk-reject',
        extensions: [{
          active: true,
          mandatory: true,
          type: 'remoteService',
          remoteService: 'geocoder-koumoul',
          action: 'postCoords'
        }]
      })).data
      assert.equal(ds.status, 'finalized')

      // build a body that exceeds 200 chars
      const body = Array.from({ length: 50 }, (_, i) => ({ _action: 'create', adr: `address ${i}` }))
      const res = await testUser1.post(`/api/v1/datasets/${ds.id}/_bulk_lines`, body, { validateStatus: () => true })
      assert.equal(res.status, 400)
      assert.match(JSON.stringify(res.data), /obligatoire/)
    } finally {
      await setConfig('elasticsearch.maxBulkChars', 200000)
    }
  })

  test('uploaded attachment is rolled back when mandatory remoteService rejects the line', async () => {
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    const ds = (await testUser1.post('/api/v1/datasets/rest-mandatory-attach', {
      isRest: true,
      title: 'rest-mandatory-attach',
      schema: [
        { key: 'adr', type: 'string', 'x-refersTo': 'http://schema.org/address' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ],
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })).data
    assert.equal(ds.status, 'finalized')

    const form = new FormData()
    const attachmentContent = fs.readFileSync('./tests/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('adr', 'somewhere')
    const res = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      validateStatus: () => true
    })
    assert.equal(res.status, 400)
    assert.match(JSON.stringify(res.data), /enrichissement obligatoire/)

    // line not persisted
    assert.equal(await restCollectionCount(ds.id), 0)
    // and the uploaded attachment was cleaned up — no orphan on disk
    const attachments = await lsAttachments(ds.id)
    assert.equal(attachments.length, 0, `expected no orphaned attachment, got ${JSON.stringify(attachments)}`)
  })

  test('a repeated failing line stays rejected even once the remoteService result is cached', async () => {
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    const ds = (await testUser1.post('/api/v1/datasets', {
      ...baseRestDataset,
      title: 'rest-mandatory-cache',
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })).data
    assert.equal(ds.status, 'finalized')

    // first write: primes the extensions-cache with the error result
    const res1 = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { adr: 'somewhere' }, { validateStatus: () => true })
    assert.equal(res1.status, 400)
    assert.match(JSON.stringify(res1.data), /enrichissement obligatoire/)

    // second write of the same address: the result is now replayed from the cache;
    // the mandatory-extension failure must still be detected and the line rejected
    const res2 = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { adr: 'somewhere' }, { validateStatus: () => true })
    assert.equal(res2.status, 400)
    assert.match(JSON.stringify(res2.data), /enrichissement obligatoire/)

    // nothing persisted from either attempt
    assert.equal(await restCollectionCount(ds.id), 0)
  })

  test('non-mandatory remoteService failure is non-blocking — line persists', async () => {
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    const ds = (await testUser1.post('/api/v1/datasets', {
      ...baseRestDataset,
      extensions: [{
        active: true,
        // no mandatory flag
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })).data
    assert.equal(ds.status, 'finalized')

    const res = await testUser1.post(`/api/v1/datasets/${ds.id}/lines`, { adr: 'somewhere' })
    assert.equal(res.status, 201)
    const count = await restCollectionCount(ds.id)
    assert.equal(count, 1)
  })
})
