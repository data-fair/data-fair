import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')
const alone = await getAxiosAuth('alone@no.org', 'passwd')
const ngernier4 = await getAxiosAuth('ngernier4@usa.gov', 'passwd')
const ngernier4Org = await getAxiosAuth('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG')
const ddecruce5 = await getAxiosAuth('ddecruce5@phpbb.com', 'passwd')
const ddecruce5Org = await getAxiosAuth('ddecruce5@phpbb.com', 'passwd', 'KWqAGZ4mG')
const bhazeldean7 = await getAxiosAuth('bhazeldean7@cnbc.com', 'passwd')
const bhazeldean7Org = await getAxiosAuth('bhazeldean7@cnbc.com', 'passwd', 'KWqAGZ4mG')
const icarlens9Org = await getAxiosAuth('icarlens9@independent.co.uk', 'passwd', 'KWqAGZ4mG')

describe('permissions', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('apply permissions to datasets', async function () {
    // A dataset with restricted permissions
    let res = await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    await dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'ddecruce5', classes: ['read'] },
      { type: 'user', email: 'alone@no.org', classes: ['list', 'read', 'write'] },
      { type: 'user', id: 'bhazeldean7', classes: ['list', 'read'] }
    ])

    // Another one that can be read by all
    res = await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'Another dataset' })
    await dmeadus.put('/api/v1/datasets/' + res.data.id + '/permissions', [
      { operations: ['readDescription', 'list'] }
    ])

    // No permissions
    await assert.rejects(
      cdurning2.get('/api/v1/datasets/' + datasetId + '/api-docs.json'),
      { status: 403 }
    )

    // User has permissions on operationId
    res = await ngernier4.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User level permission applies also if he is switched in an organization account
    res = await ngernier4Org.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permissions on class
    res = await ddecruce5.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permission given using only his email
    res = await alone.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await alone.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await alone.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 1)
    res = await alone.get('/api/v1/datasets?can=admin')
    assert.equal(res.data.count, 0)

    // Member has individual permission
    res = await bhazeldean7.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await bhazeldean7.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await bhazeldean7.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 0)

    // Read with public and private filters
    res = await anonymous.get('/api/v1/datasets')
    assert.equal(res.data.count, 1)

    res = await ngernier4.get('/api/v1/datasets')
    assert.equal(res.data.count, 2)

    res = await ngernier4.get('/api/v1/datasets?protected=true')
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, datasetId)

    res = await ngernier4.get('/api/v1/datasets?public=true')
    assert.equal(res.data.count, 1)
    assert.notEqual(res.data.results[0].id, datasetId)

    // User can create a dataset for his organization
    res = await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId2 = res.data.id
    assert.equal(res.status, 201)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId2 + '/permissions', [{ type: 'user', id: 'cdurning2', operations: ['readDescription'] }])
    res = await dmeadusOrg.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)
    res = await cdurning2.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)
    // the owner user, but with different active account
    await assert.rejects(
      dmeadus.get('/api/v1/datasets/' + datasetId2 + '/api-docs.json'),
      { status: 403 }
    )
  })

  it('apply permissions to datasets in organization and departments', async function () {
    // A dataset made accessible to all users of owner organization
    const res = await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await bhazeldean7Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(bhazeldean7Org.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: '-', classes: ['list', 'read'] }
    ])
    assert.equal((await bhazeldean7Org.get('/api/v1/datasets')).data.count, 1)
    await bhazeldean7Org.get('/api/v1/datasets/' + datasetId)
    await assert.rejects(bhazeldean7.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)

    // dataset made accessible to users of a departement
    assert.equal((await ddecruce5Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(ddecruce5Org.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: 'dep1', classes: ['list', 'read'] }
    ])
    assert.equal((await ddecruce5Org.get('/api/v1/datasets')).data.count, 1)
    await ddecruce5Org.get('/api/v1/datasets/' + datasetId)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await ddecruce5Org.get('/api/v1/datasets')).data.count, 1)
    await ddecruce5Org.get('/api/v1/datasets/' + datasetId)
  })

  it('apply permission to any authenticated user', async function () {
    const res = await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await bhazeldean7.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(bhazeldean7.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await bhazeldean7.get('/api/v1/datasets')).data.count, 1)
    await bhazeldean7.get('/api/v1/datasets/' + datasetId)
    await bhazeldean7Org.get('/api/v1/datasets/' + datasetId)
  })

  it('give permission to patch a dataset info except for potentiel breaking changes', async function () {
    // A dataset with restricted permissions
    let res = await dmeadus.post('/api/v1/datasets', {
      isRest: true,
      title: 'A dataset',
      schema: [{ key: 'str', title: 'str title', type: 'string' }]
    })
    const datasetId = res.data.id
    await dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['writeDescription', 'readDescription'] },
      { type: 'user', id: 'ddecruce5', operations: ['writeDescriptionBreaking', 'readDescription'] }
    ])

    // permission to write except breaking changes
    res = await ngernier4.patch('/api/v1/datasets/' + datasetId, { description: 'Description', schema: [{ key: 'str', title: 'another title', type: 'string' }] })
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'finalized')

    await assert.rejects(
      ngernier4.patch('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] }),
      (err: any) => err.status === 403
    )

    await assert.rejects(
      ngernier4.patch('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'another title', type: 'number' }] }),
      (err: any) => err.status === 403
    )

    // permission to write breaking changes
    res = await ddecruce5('/api/v1/datasets/' + datasetId, { description: 'Description' })
    assert.equal(res.status, 200)
    res = await ddecruce5('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] })
    assert.equal(res.status, 200)
    res = await ddecruce5('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'yet another title', type: 'number' }] })
    assert.equal(res.status, 200)
  })

  it('Upload new dataset in user zone then change ownership to organization', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be lost
    await ax.post('/api/v1/settings/user/dmeadus0/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await assert.rejects(
      ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'organization',
        id: 'anotherorg',
        name: 'Test'
      }),
      (err: any) => err.status === 403
    )
    await assert.rejects(
      ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'user',
        id: 'anotheruser',
        name: 'Test'
      }),
      (err: any) => err.status === 403
    )
    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat'
    })
    dataset = (await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat' })
    assert.deepEqual(dataset.publicationSites, [])
    const newPermissions = (await dmeadusOrg.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

  it('Upload new dataset in org zone then change ownership to department', async function () {
    const ax = dmeadusOrg
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be preserved too
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      department: 'dep1',
      name: 'Fivechat'
    })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat', department: 'dep1' })
    assert.deepEqual(dataset.publicationSites, ['data-fair-portals:portal1'])
    const newPermissions = (await ax.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

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
