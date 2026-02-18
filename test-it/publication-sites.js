import { strict as assert } from 'node:assert'
import validateDcat from '../api/src/misc/utils/dcat/validate.js'
import { memoizedGetPublicationSiteSettings } from '@data-fair/data-fair-api/src/misc/utils/settings.ts'
import testEvents from '@data-fair/data-fair-api/src/misc/utils/test-events.ts'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, formHeaders, dmeadusOrg, hlalonde3Org, ngernier4Org, ddecruce5Org } from './utils/index.ts'

describe('publication sites', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should fail to publish dataset on unknown site', async function () {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should fail to publish application on unknown site', async function () {
    const ax = dmeadusOrg

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await assert.rejects(ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should fail to request publication of dataset on unknown site', async function () {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should publish dataset on a org site', async function () {
    const ax = dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  it('should publish dataset on a org site and access it from re-exposition of data-fair', async function () {
    const ax = dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data

    const otherDataset = (await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'other dataset', schema: [] })).data

    await assert.rejects(ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${dataset.id}`), (err) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'publication site unknown')
      return true
    })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:5601' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
    memoizedGetPublicationSiteSettings.clear()

    await assert.rejects(ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${otherDataset.id}`), (err) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'Dataset not found')
      return true
    })
    assert.ok(await ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${dataset.id}`))

    // dataset is listed (but not otherDatasets) as it belongs to the publication site's owner
    let publishedDatasets = (await ax.get('http://localhost:5601/data-fair/api/v1/datasets')).data
    assert.equal(publishedDatasets.results.length, 1)
    publishedDatasets = (await ax.get('http://localhost:5601/data-fair/api/v1/datasets?publicationSites=data-fair-portals:portal1')).data
    assert.equal(publishedDatasets.results.length, 0)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    assert.ok(await ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${dataset.id}`))
    assert.ok(await ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${dataset.id}/lines`))
    publishedDatasets = (await ax.get('http://localhost:5601/data-fair/api/v1/datasets')).data
    assert.equal(publishedDatasets.results.length, 1)

    const datasetsCatalog = (await ax.get('http://localhost:5601/data-fair/api/v1/catalog/datasets')).data
    assert.equal(datasetsCatalog.results.length, 1)
    assert.equal(datasetsCatalog.count, 1)

    const dcatCatalog = (await ax.get('http://localhost:5601/data-fair/api/v1/catalog/dcat')).data
    const valid = validateDcat(dcatCatalog)
    if (!valid) console.error('DCAT validation failed', validateDcat.errors)
    assert.ok(valid)
    assert.ok(dcatCatalog.dataset?.length, 1)
  })

  it('should publish application on a org site', async function () {
    const ax = dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  it('department admin should fail to publish dataset on org site', async function () {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 403)
  })

  it('department admin can request publishing dataset on org site', async function () {
    let notif
    testEvents.on('notification', (n) => {
      notif = n
    })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
    assert.equal(notif.title.fr, 'Demande de publication de jeu de données')
    assert.equal(notif.body.fr, 'Un contributeur demande de publier le jeu de données published dataset (published-dataset) sur portal.com.')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, undefined)
  })

  it('department admin can publish dataset on department site', async function () {
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

  it('department contrib cannot publish dataset on department site', async function () {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 403)
  })

  it('department contrib can request publishing dataset on department site', async function () {
    let notif
    testEvents.on('notification', (n) => { notif = n })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
    assert.equal(notif.title.fr, 'Demande de publication de jeu de données')
    assert.equal(notif.body.fr, 'Un contributeur demande de publier le jeu de données published dataset (published-dataset) sur portal.com.')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, 'dep1')
  })

  it('contrib can publish on a "staging" publication site', async function () {
    const portalProd = { type: 'data-fair-portals', id: 'portal-staging', url: 'http://portal.com', settings: { staging: true } }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalProd)
    const portalStaging = { type: 'data-fair-portals', id: 'portal-prod', url: 'http://portal.com' }
    await dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalStaging)

    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await assert.rejects(ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-unknown'] }), err => err.status === 404)
    await assert.rejects(ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-prod'] }), err => err.status === 403)
    await ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-staging'] })
  })
})
