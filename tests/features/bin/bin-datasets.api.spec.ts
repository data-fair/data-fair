import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, patchRawDataset, patchRawApplication, clearDatasetCache, clearPublicationSitesCache } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1') // admin of test_org1

const shelved = () => ({ at: new Date().toISOString(), by: { id: 'test_user1', name: 'x' } })

test.describe('shelved reads as missing', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a shelved dataset answers 404 on every single-resource read', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { slug: 'binned-slug' })
    // reads work before shelving
    for (const sub of ['', '/lines', '/raw', '/schema', '/permissions']) {
      assert.equal((await testUser1Org.get(`/api/v1/datasets/${dataset.id}${sub}`)).status, 200, sub)
    }
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await clearDatasetCache()
    for (const key of [dataset.id, 'binned-slug']) {
      for (const sub of ['', '/lines', '/raw', '/schema', '/permissions']) {
        await assert.rejects(testUser1Org.get(`/api/v1/datasets/${key}${sub}`), { status: 404 }, `${key}${sub}`)
      }
    }
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { title: 'x' }), { status: 404 })
  })

  test('a dataset shelved after being cached reads as missing', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)).status, 200)
    // no cache clearing: the freshness probe alone must notice
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 404 })
  })

  test('an application configured with a shelved dataset cannot read it', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await clearDatasetCache()
    assert.equal((await testUser1Org.get(`/api/v1/applications/${app.id}`)).status, 200)
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${app.id}/` } }), { status: 404 })
  })

  test('a shelved application cannot be the parent of a dataset', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await patchRawApplication(dashboard.id, { shelved: shelved() })
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'application', id: dashboard.id } }), { status: 404 })
  })
})

test.describe('shelved absent from listings', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const publicUrl2 = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}/data-fair`

  test('a shelved dataset is absent from the listing, counts, facets, search, id pinning, catalog and activity', async () => {
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://' + process.env.DEV_HOST + ':' + process.env.NGINX_PORT2 })
    await clearPublicationSitesCache()
    const live = (await testUser1Org.post('/api/v1/datasets/bin-live', { isRest: true, title: 'bin live quokkalive', schema: [], publicationSites: ['data-fair-portals:portal1'] })).data
    const gone = (await testUser1Org.post('/api/v1/datasets/bin-gone', { isRest: true, title: 'bin gone quokkashelved', schema: [], publicationSites: ['data-fair-portals:portal1'] })).data
    await patchRawDataset(gone.id, { shelved: shelved() })

    const list = (await testUser1Org.get('/api/v1/datasets?owner=organization:test_org1&facets=owner')).data
    assert.equal(list.count, 1)
    assert.deepEqual(list.results.map((r: any) => r.id), [live.id])
    const facetTotal = Object.values(list.facets.owner).reduce((a: number, f: any) => a + f.count, 0)
    assert.equal(facetTotal, 1)

    assert.equal((await testUser1Org.get('/api/v1/datasets?q=quokkashelved')).data.count, 0)
    assert.equal((await testUser1Org.get('/api/v1/datasets?q=quokkalive')).data.count, 1)
    assert.equal((await testUser1Org.get(`/api/v1/datasets?id=${gone.id}`)).data.count, 0)
    assert.equal((await testUser1Org.get(`/api/v1/datasets?id=${live.id}`)).data.count, 1)

    const catalog = (await testUser1Org.get(`${publicUrl2}/api/v1/catalog/datasets`)).data
    assert.deepEqual(catalog.results.map((r: any) => r.id), [live.id])
    assert.equal(catalog.count, 1)
    const dcat = JSON.stringify((await testUser1Org.get(`${publicUrl2}/api/v1/catalog/dcat`)).data)
    assert.ok(dcat.includes('quokkalive'))
    assert.ok(!dcat.includes('quokkashelved'))

    const activity = (await testUser1Org.get('/api/v1/activity')).data.results
    assert.ok(activity.find((r: any) => r.id === live.id))
    assert.ok(!activity.find((r: any) => r.id === gone.id))
  })

  test('syncApplications drops a shelved application from dataset.extras.applications', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await patchRawApplication(app.id, { shelved: shelved() })
    // re-sync is triggered by a new configuration of another application
    const other = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${other.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await clearDatasetCache()
    const refs = (await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)).data.extras?.applications ?? []
    assert.deepEqual(refs.map((a: any) => a.id), [other.id])
  })
})
