import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { clearPublicationSitesCache } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const dmeadusOrg = await axiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const hlalonde3Org = await axiosAuth('hlalonde3@desdev.cn', 'passwd', 'KWqAGZ4mG')
const ngernier4Org = await axiosAuth('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG')
const ddecruce5Org = await axiosAuth('ddecruce5@phpbb.com', 'passwd', 'KWqAGZ4mG')

const publicUrl2 = `http://localhost:${process.env.NGINX_PORT2}/data-fair`

test.describe('publication sites', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('should fail to publish dataset on unknown site', async () => {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should fail to publish application on unknown site', async () => {
    const ax = dmeadusOrg

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await assert.rejects(ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should fail to request publication of dataset on unknown site', async () => {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 404)
  })

  test('should publish dataset on a org site', async () => {
    const ax = dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  test('should publish dataset on a org site and access it from re-exposition of data-fair', async () => {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    const otherDataset = (await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'other dataset', schema: [] })).data

    await assert.rejects(ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`), (err: any) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'publication site unknown')
      return true
    })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
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

    // TODO: validateDcat is imported from api/src and cannot be used externally
    // const dcatCatalog = (await ax.get(`${publicUrl2}/api/v1/catalog/dcat`)).data

    // Test multi-domain image support
    const imageFullUrl = config.publicUrl + '/uploads/test-image.png'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { image: imageFullUrl })
    const publishedDataset = (await ax.get(`${publicUrl2}/api/v1/datasets/${dataset.id}`)).data
    assert.equal(publishedDataset.image, `${publicUrl2}/uploads/test-image.png`)
  })

  test('should publish application on a org site', async () => {
    const ax = dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
    await clearPublicationSitesCache()

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    // Test multi-domain image support
    const imageFullUrl = config.publicUrl + '/uploads/app-image.png'
    await ax.patch(`/api/v1/applications/${app.id}`, { image: imageFullUrl })
    const publishedApp = (await ax.get(`${publicUrl2}/api/v1/applications/${app.id}`)).data
    assert.equal(publishedApp.image, `${publicUrl2}/uploads/app-image.png`)
  })

  test('department admin should fail to publish dataset on org site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 403)
  })

  // TODO: This test requires testEvents.on('notification', ...) which cannot be used externally.
  // A dedicated SSE/webhook endpoint is needed to capture notifications in external tests.
  test.skip('department admin can request publishing dataset on org site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    // TODO: notification assertions require testEvents
  })

  test('department admin can publish dataset on department site', async () => {
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', { type: 'data-fair-portals', id: 'portalorg', url: 'http://portal.com' })
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    let publicationSites = (await hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites')).data
    assert.equal(publicationSites.length, 2)
    assert.equal(publicationSites[0].id, 'portalorg')
    assert.equal(publicationSites[0].department, undefined)
    assert.equal(publicationSites[1].id, 'portal1')
    assert.equal(publicationSites[1].department, 'dep1')

    publicationSites = (await hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:*/publication-sites')).data
    assert.equal(publicationSites.length, 2)
    assert.equal(publicationSites[0].id, 'portalorg')
    assert.equal(publicationSites[0].department, undefined)
    assert.equal(publicationSites[1].id, 'portal1')
    assert.equal(publicationSites[1].department, 'dep1')

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  test('department contrib cannot publish dataset on department site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      (err: any) => err.status === 403)
  })

  // TODO: This test requires testEvents.on('notification', ...) which cannot be used externally.
  test.skip('department contrib can request publishing dataset on department site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    // TODO: notification assertions require testEvents
  })

  test('contrib can publish on a "staging" publication site', async () => {
    const portalProd = { type: 'data-fair-portals', id: 'portal-staging', url: 'http://portal.com', settings: { staging: true } }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalProd)
    const portalStaging = { type: 'data-fair-portals', id: 'portal-prod', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalStaging)

    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-unknown'] }), (err: any) => err.status === 404)
    await assert.rejects(ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-prod'] }), (err: any) => err.status === 403)
    await ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-staging'] })
  })
})
