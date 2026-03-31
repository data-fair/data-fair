import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config, mockAppUrl } from '../../support/axios.ts'
import { clearPublicationSitesCache, validateDcat } from '../../support/workers.ts'
import { TestEventClient } from '../../support/events.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')
const testUser6Org = await axiosAuth('test_user6@test.com', 'test_org1')

const publicUrl2 = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}/data-fair`

test.describe('publication sites', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should fail to publish dataset on unknown site', async () => {
    const ax = testUser1Org

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should fail to publish application on unknown site', async () => {
    const ax = testUser1Org

    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await assert.rejects(ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should fail to request publication of dataset on unknown site', async () => {
    const ax = testUser1Org

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should publish dataset on a org site', async () => {
    const ax = testUser1Org

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  test('should publish dataset on a org site and access it from re-exposition of data-fair', async () => {
    const ax = testUser1Org

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    const otherDataset = (await testUser1.post('/api/v1/datasets', { isRest: true, title: 'other dataset', schema: [] })).data

    await assert.rejects(ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`), (err: any) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'publication site unknown')
      return true
    })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://' + process.env.DEV_HOST + ':' + process.env.NGINX_PORT2 }
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', portal)
    await clearPublicationSitesCache()

    await assert.rejects(ax.get(`${publicUrl2}/api/v1/datasets/${otherDataset.id}`), (err: any) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'Dataset not found')
      return true
    })
    assert.ok(await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`))

    // dataset is listed (but not otherDatasets) as it belongs to the publication site's owner
    let publishedDatasets = (await ax.get(`${publicUrl2}/api/v1/datasets`)).data
    assert.equal(publishedDatasets.results.length, 1)
    publishedDatasets = (await ax.get(`${publicUrl2}/api/v1/datasets?publicationSites=data-fair-portals:portal1`)).data
    assert.equal(publishedDatasets.results.length, 0)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    assert.ok(await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`))
    assert.ok(await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}/lines`))
    publishedDatasets = (await ax.get(`${publicUrl2}/api/v1/datasets`)).data
    assert.equal(publishedDatasets.results.length, 1)

    const datasetsCatalog = (await ax.get(`${publicUrl2}/api/v1/catalog/datasets`)).data
    assert.equal(datasetsCatalog.results.length, 1)
    assert.equal(datasetsCatalog.count, 1)

    const dcatCatalog = (await ax.get(`${publicUrl2}/api/v1/catalog/dcat`)).data
    const dcatValidation = await validateDcat(dcatCatalog)
    assert.ok(dcatValidation.valid, `DCAT validation failed: ${JSON.stringify(dcatValidation.errors)}`)

    // Test multi-domain image support
    const imageFullUrl = config.publicUrl + '/uploads/test-image.png'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { image: imageFullUrl })
    const publishedDataset = (await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`)).data
    assert.equal(publishedDataset.image, `${publicUrl2}/uploads/test-image.png`)
  })

  test('should publish application on a org site', async () => {
    const ax = testUser1Org

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://' + process.env.DEV_HOST + ':' + process.env.NGINX_PORT2 }
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', portal)
    await clearPublicationSitesCache()

    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data

    await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    // Test multi-domain image support
    const imageFullUrl = config.publicUrl + '/uploads/app-image.png'
    await ax.patch(`/api/v1/applications/${app.id}`, { image: imageFullUrl })
    const publishedApp = (await ax.get(`${publicUrl2}/api/v1/applications/${app.id}`)).data
    assert.equal(publishedApp.image, `${publicUrl2}/uploads/app-image.png`)
  })

  test('department admin should fail to publish dataset on org site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 403)
  })

  test('department admin can request publishing dataset on org site', async () => {
    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
      await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

      const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
      await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })

      // Wait briefly for notification to arrive via SSE
      await new Promise(resolve => setTimeout(resolve, 500))
      const notif = notifs.find((n: any) => n.topic?.key?.includes('publication-requested'))
      assert.ok(notif, 'expected a publication-requested notification')
      assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
      assert.equal(notif.sender.type, 'organization')
      assert.equal(notif.sender.id, 'test_org1')
      assert.equal(notif.sender.department, undefined)
    } finally {
      events.close()
    }
  })

  test('department admin can publish dataset on department site', async () => {
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', { type: 'data-fair-portals', id: 'portalorg', url: 'http://portal.com' })
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await testUser4Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', portal)

    let publicationSites = (await testUser4Org.get('/api/v1/settings/organization/test_org1:dep1/publication-sites')).data
    assert.equal(publicationSites.length, 2)
    assert.equal(publicationSites[0].id, 'portalorg')
    assert.equal(publicationSites[0].department, undefined)
    assert.equal(publicationSites[1].id, 'portal1')
    assert.equal(publicationSites[1].department, 'dep1')

    publicationSites = (await testUser4Org.get('/api/v1/settings/organization/test_org1:*/publication-sites')).data
    assert.equal(publicationSites.length, 2)
    assert.equal(publicationSites[0].id, 'portalorg')
    assert.equal(publicationSites[0].department, undefined)
    assert.equal(publicationSites[1].id, 'portal1')
    assert.equal(publicationSites[1].department, 'dep1')

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  test('department contrib cannot publish dataset on department site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await testUser4Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 403)
  })

  test('department contrib can request publishing dataset on department site', async () => {
    const events = new TestEventClient()
    await events.ready
    try {
      const notifs: any[] = []
      events.on('notification', (n: any) => notifs.push(n))

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
      await testUser4Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', portal)

      const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
      await testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })

      // Wait briefly for notification to arrive via SSE
      await new Promise(resolve => setTimeout(resolve, 500))
      const notif = notifs.find((n: any) => n.topic?.key?.includes('publication-requested'))
      assert.ok(notif, 'expected a publication-requested notification')
      assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
      assert.equal(notif.sender.type, 'organization')
      assert.equal(notif.sender.id, 'test_org1')
      assert.equal(notif.sender.department, 'dep1')
    } finally {
      events.close()
    }
  })

  test('contrib can publish on a "staging" publication site', async () => {
    const portalProd = { type: 'data-fair-portals', id: 'portal-staging', url: 'http://portal.com', settings: { staging: true } }
    await testUser1Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', portalProd)
    const portalStaging = { type: 'data-fair-portals', id: 'portal-prod', url: 'http://portal.com' }
    await testUser1Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', portalStaging)

    const dataset = (await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(testUser5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-unknown'] }), (err: any) => err.status === 404)
    await assert.rejects(testUser5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-prod'] }), (err: any) => err.status === 403)
    await testUser5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-staging'] })
  })

  test('should access dataset and application by slug through publication site domain', async () => {
    const ax = testUser1Org

    // register a publication site on NGINX_PORT2
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://' + process.env.DEV_HOST + ':' + process.env.NGINX_PORT2 }
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', portal)
    await clearPublicationSitesCache()

    // create a dataset with a title so slug differs from nanoid-based id
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'my published dataset', schema: [] })).data
    assert.ok(dataset.slug, 'dataset should have a slug')
    assert.notEqual(dataset.slug, dataset.id, 'slug should differ from id')

    // publish dataset to the site
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    // access by id through publication site domain - should work
    const byId = (await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`)).data
    assert.equal(byId.id, dataset.id)

    // access by slug through publication site domain - this is the regression
    const bySlug = (await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.slug}`)).data
    assert.equal(bySlug.id, dataset.id)

    // create an application and publish it
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'my published app' })).data
    assert.ok(app.slug, 'application should have a slug')
    assert.notEqual(app.slug, app.id, 'slug should differ from id')
    await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    // access application by slug through publication site domain
    const appBySlug = (await ax.get(`${publicUrl2}/api/v1/applications/${app.slug}`)).data
    assert.equal(appBySlug.id, app.id)
  })
})
