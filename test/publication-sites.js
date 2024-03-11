const assert = require('assert').strict

const workers = require('../server/workers')
const app = require('../server/app')

describe('publication sites', () => {
  it('should fail to publish dataset on unknown site', async () => {
    const ax = global.ax.dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should fail to publish application on unknown site', async () => {
    const ax = global.ax.dmeadusOrg

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await assert.rejects(ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should fail to request publication of dataset on unknown site', async () => {
    const ax = global.ax.dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 404)
  })

  it('should publish dataset on a org site', async () => {
    const ax = global.ax.dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  it('should publish dataset on a org site and access it from re-exposition of data-fair', async () => {
    const ax = global.ax.dmeadusOrg

    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)

    const otherDataset = (await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'other dataset', schema: [] })).data
    await workers.hook(`finalizer/${otherDataset.id}`)

    await assert.rejects(ax.get(`http://localhost:5601/data-fair/api/v1/datasets/${dataset.id}`), (err) => {
      assert.equal(err.status, 404)
      assert.equal(err.data, 'publication site unknown')
      return true
    })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:5601' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
    app.memoizedGetPublicationSiteSettings.clear()

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
  })

  it('should publish application on a org site', async () => {
    const ax = global.ax.dmeadusOrg

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  it('department admin should fail to publish dataset on org site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await global.ax.dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await global.ax.hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await assert.rejects(global.ax.hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 403)
  })

  it('department admin can request publishing dataset on org site', async () => {
    let notif
    global.events.on('notification', (n) => { notif = n })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await global.ax.dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    const dataset = (await global.ax.hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await global.ax.hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
    assert.equal(notif.body, 'published dataset - Huntington Lalonde')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, undefined)
  })

  it('department admin can publish dataset on department site', async () => {
    await global.ax.dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', { type: 'data-fair-portals', id: 'portalorg', url: 'http://portal.com' })
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await global.ax.hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const publicationSites = (await global.ax.hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites')).data
    assert.equal(publicationSites.length, 2)
    assert.equal(publicationSites[0].id, 'portalorg')
    assert.equal(publicationSites[0].department, undefined)
    assert.equal(publicationSites[1].id, 'portal1')
    assert.equal(publicationSites[1].department, 'dep1')

    const dataset = (await global.ax.hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await global.ax.hlalonde3Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })
  })

  it('department contrib cannot publish dataset on department site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await global.ax.hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await global.ax.hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await assert.rejects(global.ax.ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] }),
      err => err.status === 403)
  })

  it('department contrib can request publishing dataset on department site', async () => {
    let notif
    global.events.on('notification', (n) => { notif = n })

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' }
    await global.ax.hlalonde3Org.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portal)

    const dataset = (await global.ax.hlalonde3Org.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await global.ax.ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { requestedPublicationSites: ['data-fair-portals:portal1'] })
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:' + dataset.slug)
    assert.equal(notif.body, 'published dataset - Duky De Cruce')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, 'dep1')
  })

  it('contrib can publish on a "staging" publication site', async () => {
    const portalProd = { type: 'data-fair-portals', id: 'portal-staging', url: 'http://portal.com', settings: { staging: true } }
    await global.ax.dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalProd)
    const portalStaging = { type: 'data-fair-portals', id: 'portal-prod', url: 'http://portal.com' }
    await global.ax.dmeadusOrg.post('/api/v1/settings/organization/KWqAGZ4mG:dep1/publication-sites', portalStaging)

    const dataset = (await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'published dataset', schema: [] })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await assert.rejects(global.ax.ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-unknown'] }), err => err.status === 404)
    await assert.rejects(global.ax.ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-prod'] }), err => err.status === 403)
    await global.ax.ngernier4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal-staging'] })
  })
})
