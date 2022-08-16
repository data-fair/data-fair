const assert = require('assert').strict

const workers = require('../server/workers')

describe.only('settings API', () => {
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
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:published-dataset')
    assert.equal(notif.body, 'published dataset - Huntington Lalonde')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, undefined)
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
    assert.equal(notif.topic.key, 'data-fair:dataset-publication-requested:data-fair-portals:portal1:published-dataset')
    assert.equal(notif.body, 'published dataset - Duky De Cruce')
    assert.equal(notif.sender.type, 'organization')
    assert.equal(notif.sender.id, 'KWqAGZ4mG')
    assert.equal(notif.sender.department, 'dep1')
  })
})
