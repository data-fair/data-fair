import { strict as assert } from 'node:assert'

describe('owner roles', () => {
  it('user can do everything in his own account', async () => {
    const dataset = (await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Danna Meadus')
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
    // can create a dataset and use it, but not administrate it
    const dataset = (await global.ax.ngernier4Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    try {
      await global.ax.ngernier4Org.get(`/api/v1/datasets/${dataset.id}/permissions`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // can create an application and use it
    const application = (await global.ax.ngernier4Org.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await global.ax.ngernier4Org.get(`/api/v1/applications/${application.id}`)

    // cannot create a catalog
    try {
      await global.ax.ngernier4Org.post('/api/v1/catalogs', {})
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('organization user has even more limited capabilities', async () => {
    await assert.rejects(global.ax.bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), err => err.status === 403)
    const dataset = (await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    const datasets = (await global.ax.bhazeldean7Org.get('/api/v1/datasets')).data
    assert.equal(datasets.count, 0)
    await assert.rejects(global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)
    await assert.rejects(global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/lines`), err => err.status === 403)
    await assert.rejects(global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/permissions`), err => err.status === 403)
    await assert.rejects(global.ax.bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/journal`), err => err.status === 403)
    await assert.rejects(global.ax.bhazeldean7Org.delete(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)

    await assert.rejects(global.ax.bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), err => err.status === 403)
    const application = (await global.ax.dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await assert.rejects(global.ax.bhazeldean7Org.get(`/api/v1/applications/${application.id}`), err => err.status === 403)
    await assert.rejects(global.ax.bhazeldean7Org.delete(`/api/v1/applications/${application.id}`), err => err.status === 403)

    // cannot create a catalog
    await assert.rejects(global.ax.bhazeldean7Org.post('/api/v1/catalogs', {}), err => err.status === 403)
  })

  it('departments can be used to restrict contrib capabilities', async () => {
    // dataset is not attached to specific department at first
    const dataset = (await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, undefined)

    // admin in org without department restriction -> ok for read and write
    await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    const initialPermissions = (await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
    assert.equal(initialPermissions.length, 2)
    assert.deepEqual(initialPermissions, [{
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: '-',
      operations: ['delete'],
      roles: ['contrib'],
      classes: ['write']
    }, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: '-',
      operations: [],
      roles: ['contrib'],
      classes: ['list', 'read', 'readAdvanced']
    }])
    await global.ax.dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // outside user -> ko
    await assert.rejects(global.ax.ddecruce5.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)
    // contrib from any department does not have owner privilege if the resource does not belong to any department
    await assert.rejects(global.ax.icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)
    await assert.rejects(global.ax.icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), err => err.status === 403)
    await assert.rejects(global.ax.ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)
    await assert.rejects(global.ax.ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), err => err.status === 403)
    // switch ownership to a specific department
    await global.ax.dmeadusOrg.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: 'dep1'
    })
    const newOwnerPermissions = (await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
    assert.deepEqual(newOwnerPermissions, [{
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: 'dep1',
      operations: ['delete'],
      roles: ['contrib'],
      classes: ['write']
    }, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: 'dep1',
      operations: [],
      roles: ['contrib'],
      classes: ['list', 'read', 'readAdvanced']
    }])
    // admin in org without department restriction -> ok
    await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from right department -> ok
    await global.ax.ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`)
    await global.ax.ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from wrong department -> ko
    await assert.rejects(global.ax.icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), err => err.status === 403)
    await assert.rejects(global.ax.icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), err => err.status === 403)
  })

  it('department restriction is automatically applied', async () => {
    const dataset = (await global.ax.ddecruce5Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, 'dep1')
  })
})
