import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth } from './utils/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const bhazeldean7Org = await getAxiosAuth('bhazeldean7@cnbc.com', 'passwd', 'KWqAGZ4mG')
const ngernier4Org = await getAxiosAuth('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG')
const icarlens9Org = await getAxiosAuth('icarlens9@independent.co.uk', 'passwd', 'KWqAGZ4mG')
const ddecruce5 = await getAxiosAuth('ddecruce5@phpbb.com', 'passwd')
const ddecruce5Org = await getAxiosAuth('ddecruce5@phpbb.com', 'passwd', 'KWqAGZ4mG')
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
    // can create a dataset and use it, but not administrate it
    const dataset = (await ngernier4Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    await ngernier4Org.get(`/api/v1/datasets/${dataset.id}`)
    await ngernier4Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    await assert.rejects(
      ngernier4Org.get(`/api/v1/datasets/${dataset.id}/permissions`),
      { status: 403 }
    )

    // can create an application and use it
    const application = (await ngernier4Org.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await ngernier4Org.get(`/api/v1/applications/${application.id}`)

    // cannot patch settings
    await assert.rejects(ngernier4Org.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [] }), { status: 403 })
  })

  it('organization user has even more limited capabilities', async function () {
    await assert.rejects(bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), (err: any) => err.status === 403)
    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Fivechat')
    const datasets = (await bhazeldean7Org.get('/api/v1/datasets')).data
    assert.equal(datasets.count, 0)
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 403)
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/permissions`), (err: any) => err.status === 403)
    await assert.rejects(bhazeldean7Org.get(`/api/v1/datasets/${dataset.id}/journal`), (err: any) => err.status === 403)
    await assert.rejects(bhazeldean7Org.delete(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)

    await assert.rejects(bhazeldean7Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), (err: any) => err.status === 403)
    const application = (await dmeadusOrg.post('/api/v1/applications', { title: 'An application', url: 'http://monapp1.com/' })).data
    await assert.rejects(bhazeldean7Org.get(`/api/v1/applications/${application.id}`), (err: any) => err.status === 403)
    await assert.rejects(bhazeldean7Org.delete(`/api/v1/applications/${application.id}`), (err: any) => err.status === 403)

    // cannot patch settings
    await assert.rejects(bhazeldean7Org.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [] }), { status: 403 })
  })

  it('departments can be used to restrict contrib capabilities', async function () {
    // dataset is not attached to specific department at first
    const dataset = (await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, undefined)

    // admin in org without department restriction -> ok for read and write
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
    // outside user -> ko
    await assert.rejects(ddecruce5.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    // contrib from any department does not have owner privilege if the resource does not belong to any department
    await assert.rejects(icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
    await assert.rejects(ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
    // switch ownership to a specific department
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
    // admin in org without department restriction -> ok
    await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
    await dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from right department -> ok
    await ddecruce5Org.get(`/api/v1/datasets/${dataset.id}`)
    await ddecruce5Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from wrong department -> ko
    await assert.rejects(icarlens9Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(icarlens9Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
  })

  it('department restriction is automatically applied', async function () {
    const dataset = (await ddecruce5Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, 'dep1')
  })
})
