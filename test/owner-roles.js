const assert = require('assert').strict
const workers = require('../server/workers')

describe('owner roles', () => {
  it('user can do everything in his own account', async () => {
    const dataset = (await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Danna Meadus')
    await workers.hook('indexer/' + dataset.id)
    await global.ax.dmeadus.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.dmeadus.get(`/api/v1/datasets/${dataset.id}/lines`)
    await global.ax.dmeadus.get(`/api/v1/datasets/${dataset.id}/permissions`)
    await global.ax.dmeadus.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await global.ax.dmeadus.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await global.ax.dmeadus.get(`/api/v1/applications/${application.id}`)

    const catalogInit = (await global.ax.dmeadus.post('/api/v1/catalogs/_init', null, { params: { url: 'http://test-catalog.com' } })).data
    const catalog = (await global.ax.dmeadus.post('/api/v1/catalogs', { ...catalogInit, apiKey: 'apikey' })).data
    await global.ax.dmeadus.get(`/api/v1/catalogs/${catalog.id}`)
  })

  it('organization admin can do everything', async () => {
    const dataset = (await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await workers.hook('indexer/' + dataset.id)
    await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines`)
    await global.ax.dmeadusOrg.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await global.ax.dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await global.ax.dmeadusOrg.get(`/api/v1/applications/${application.id}`)
    await global.ax.dmeadusOrg.delete(`/api/v1/applications/${application.id}`)

    const catalogInit = (await global.ax.dmeadusOrg.post('/api/v1/catalogs/_init', null, { params: { url: 'http://test-catalog.com' } })).data
    const catalog = (await global.ax.dmeadusOrg.post('/api/v1/catalogs', { ...catalogInit, apiKey: 'apikey' })).data
    await global.ax.dmeadusOrg.get(`/api/v1/catalogs/${catalog.id}`)
    await global.ax.dmeadusOrg.delete(`/api/v1/catalogs/${catalog.id}`)
  })

  it('organization contrib has limited capabilities', async () => {
    // can create a dataset and use it, but not delete it or administrate it
    const dataset = (await global.ax.ngernier4Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await workers.hook('indexer/' + dataset.id)
    await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    try {
      await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}/permissions`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await global.ax.ngernier4Org.delete(`/api/v1/datasets/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // can create an application and use it, but not delete it
    const application = (await global.ax.ngernier4Org.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await global.ax.ngernier4Org.get(`/api/v1/applications/${application.id}`)
    try {
      await global.ax.ngernier4Org.delete(`/api/v1/applications/${application.id}`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // cannot create a catalog
    try {
      await global.ax.ngernier4Org.post('/api/v1/catalogs', {})
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('organization user has even more limited capabilities', async () => {
    try {
      await global.ax.bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    const dataset = (await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await workers.hook('indexer/' + dataset.id)
    await global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    try {
      await global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/permissions`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/journal`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await global.ax.bhazeldean7Org.delete(`/api/v1/datasets/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    try {
      await global.ax.bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    const application = (await global.ax.dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await global.ax.bhazeldean7Org.get(`/api/v1/applications/${application.id}`)
    try {
      await global.ax.bhazeldean7Org.delete(`/api/v1/applications/${application.id}`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // cannot create a catalog
    try {
      await global.ax.bhazeldean7Org.post('/api/v1/catalogs', {})
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })
})
