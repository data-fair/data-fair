import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, dmeadusOrg, ngernier4Org, bhazeldean7Org, ddecruce5Org, icarlens9Org, ddecruce5 } from './utils/index.ts'

describe('owner roles', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('user can do everything in his own account', async function () {
    const dataset = (await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Danna Meadus')
    await dmeadus.get(`/api/v1/datasets/${dataset.id}`)
    await dmeadus.get(`/api/v1/datasets/${dataset.id}/lines`)
    await dmeadus.get(`/api/v1/datasets/${dataset.id}/permissions`)
    await dmeadus.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await dmeadus.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await dmeadus.get(`/api/v1/applications/${application.id}`)
  })

  it('organization admin can do everything', async function () {
    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines`)
    await dmeadusOrg.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await dmeadusOrg.get(`/api/v1/applications/${application.id}`)
    await dmeadusOrg.delete(`/api/v1/applications/${application.id}`)
  })

  it('organization contrib has limited capabilities', async function () {
    const dataset = (await ngernier4Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await ngernier4Org.get(`/api/v1/datasets/${dataset.id}`)
    await ngernier4Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    await assert.rejects(ngernier4Org.get(`/api/v1/datasets/${dataset.id}/permissions`), { status: 403 })

    const application = (await ngernier4Org.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await ngernier4Org.get(`/api/v1/applications/${application.id}`)

    await assert.rejects(ngernier4Org.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [] }), { status: 403 })
  })

  it('organization user has even more limited capabilities', async function () {
    await assert.rejects(bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), { status: 403 })
    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    const datasets = (await bhazeldean7Org.get('/api/v1/datasets')).data
    assert.equal(datasets.count, 0)
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}`), { status: 403 })
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/permissions`), { status: 403 })
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/journal`), { status: 403 })
    await assert.rejects(bhazeldean7Org.delete(`/api/v1/datasets/${dataset.id}`), { status: 403 })

    await assert.rejects(bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), { status: 403 })
    const application = (await dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await assert.rejects(bhazeldean7Org.get(`/api/v1/applications/${application.id}`), { status: 403 })
    await assert.rejects(bhazeldean7Org.delete(`/api/v1/applications/${application.id}`), { status: 403 })

    await assert.rejects(bhazeldean7Org.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [] }), { status: 403 })
  })

  it('departments can be used to restrict contrib capabilities', async function () {
    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, undefined)

    await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    const initialPermissions = (await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
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
    await dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    await assert.rejects(ddecruce5.get(`/api/v1/datasets/${dataset.id}`), { status: 403 })
    await assert.rejects(icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), { status: 403 })
    await assert.rejects(icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), { status: 403 })
    await assert.rejects(ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`), { status: 403 })
    await assert.rejects(ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), { status: 403 })
    await dmeadusOrg.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat',
      department: 'dep1'
    })
    const newOwnerPermissions = (await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
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
    await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    await dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    await ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`)
    await ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    await assert.rejects(icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), { status: 403 })
    await assert.rejects(icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), { status: 403 })
  })

  it('department restriction is automatically applied', async function () {
    const dataset = (await ddecruce5Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, 'dep1')
  })
})
