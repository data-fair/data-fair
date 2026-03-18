import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser3 = await axiosAuth('test_user3@test.com')
const testAlone = await axiosAuth('test_alone@test.com')
const testUser5 = await axiosAuth('test_user5@test.com')
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')
const testUser6 = await axiosAuth('test_user6@test.com')
const testUser6Org = await axiosAuth('test_user6@test.com', 'test_org1')
const testUser8 = await axiosAuth('test_user8@test.com')
const testUser8Org = await axiosAuth('test_user8@test.com', 'test_org1')
const testUser10Org = await axiosAuth('test_user10@test.com', 'test_org1')

test.describe('permissions', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('apply permissions to datasets', async () => {
    // A dataset with restricted permissions
    let res = await testUser1.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    await testUser1.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'test_user5', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'test_user6', classes: ['read'] },
      { type: 'user', email: 'test_alone@test.com', classes: ['list', 'read', 'write'] },
      { type: 'user', id: 'test_user8', classes: ['list', 'read'] }
    ])

    // Another one that can be read by all
    res = await testUser1.post('/api/v1/datasets', { isRest: true, title: 'Another dataset' })
    await testUser1.put('/api/v1/datasets/' + res.data.id + '/permissions', [
      { operations: ['readDescription', 'list'] }
    ])

    // No permissions
    await assert.rejects(
      testUser3.get('/api/v1/datasets/' + datasetId + '/api-docs.json'),
      { status: 403 }
    )

    // User has permissions on operationId
    res = await testUser5.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User level permission applies also if he is switched in an organization account
    res = await testUser5Org.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permissions on class
    res = await testUser6.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permission given using only his email
    res = await testAlone.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await testAlone.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await testAlone.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 1)
    res = await testAlone.get('/api/v1/datasets?can=admin')
    assert.equal(res.data.count, 0)

    // Member has individual permission
    res = await testUser8.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await testUser8.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await testUser8.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 0)

    // Read with public and private filters
    res = await anonymous.get('/api/v1/datasets')
    assert.equal(res.data.count, 1)

    res = await testUser5.get('/api/v1/datasets')
    assert.equal(res.data.count, 2)

    res = await testUser5.get('/api/v1/datasets?protected=true')
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, datasetId)

    res = await testUser5.get('/api/v1/datasets?public=true')
    assert.equal(res.data.count, 1)
    assert.notEqual(res.data.results[0].id, datasetId)

    // User can create a dataset for his organization
    res = await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId2 = res.data.id
    assert.equal(res.status, 201)
    await testUser1Org.put('/api/v1/datasets/' + datasetId2 + '/permissions', [{ type: 'user', id: 'test_user3', operations: ['readDescription'] }])
    res = await testUser1Org.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)
    res = await testUser3.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)
    // the owner user, but with different active account
    await assert.rejects(
      testUser1.get('/api/v1/datasets/' + datasetId2 + '/api-docs.json'),
      { status: 403 }
    )
  })

  test('apply permissions to datasets in organization and departments', async () => {
    // A dataset made accessible to all users of owner organization
    const res = await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await testUser8Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(testUser8Org.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await testUser1Org.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'test_org1', department: '-', classes: ['list', 'read'] }
    ])
    assert.equal((await testUser8Org.get('/api/v1/datasets')).data.count, 1)
    await testUser8Org.get('/api/v1/datasets/' + datasetId)
    await assert.rejects(testUser8.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)

    // dataset made accessible to users of a departement
    assert.equal((await testUser6Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(testUser6Org.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await testUser1Org.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'test_org1', department: 'dep1', classes: ['list', 'read'] }
    ])
    assert.equal((await testUser6Org.get('/api/v1/datasets')).data.count, 1)
    await testUser6Org.get('/api/v1/datasets/' + datasetId)
    await testUser1Org.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'test_org1', department: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await testUser6Org.get('/api/v1/datasets')).data.count, 1)
    await testUser6Org.get('/api/v1/datasets/' + datasetId)
  })

  test('apply permission to any authenticated user', async () => {
    const res = await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await testUser8.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(testUser8.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await testUser1Org.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await testUser8.get('/api/v1/datasets')).data.count, 1)
    await testUser8.get('/api/v1/datasets/' + datasetId)
    await testUser8Org.get('/api/v1/datasets/' + datasetId)
  })

  test('give permission to patch a dataset info except for potentiel breaking changes', async () => {
    // A dataset with restricted permissions
    let res = await testUser1.post('/api/v1/datasets', {
      isRest: true,
      title: 'A dataset',
      schema: [{ key: 'str', title: 'str title', type: 'string' }]
    })
    const datasetId = res.data.id
    await testUser1.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'test_user5', operations: ['writeDescription', 'readDescription'] },
      { type: 'user', id: 'test_user6', operations: ['writeDescriptionBreaking', 'readDescription'] }
    ])

    // permission to write except breaking changes
    res = await testUser5.patch('/api/v1/datasets/' + datasetId, { description: 'Description', schema: [{ key: 'str', title: 'another title', type: 'string' }] })
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'finalized')

    await assert.rejects(
      testUser5.patch('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] }),
      (err: any) => err.status === 403
    )

    await assert.rejects(
      testUser5.patch('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'another title', type: 'number' }] }),
      (err: any) => err.status === 403
    )

    // permission to write breaking changes (implies writeDescription for non-breaking changes too)
    res = await testUser6.patch('/api/v1/datasets/' + datasetId, { description: 'Description' })
    assert.equal(res.status, 200)
    res = await testUser6.patch('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] })
    assert.equal(res.status, 200)
    res = await testUser6.patch('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'yet another title', type: 'number' }] })
    assert.equal(res.status, 200)
  })

  test('Upload new dataset in user zone then change ownership to organization', async () => {
    const ax = testUser1
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be lost
    await ax.post('/api/v1/settings/user/test_user1/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
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
      id: 'test_org1',
      name: 'Test Org 1'
    })
    dataset = (await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'test_org1', name: 'Test Org 1' })
    assert.deepEqual(dataset.publicationSites, [])
    const newPermissions = (await testUser1Org.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

  test('Upload new dataset in org zone then change ownership to department', async () => {
    const ax = testUser1Org
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be preserved too
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'test_org1',
      department: 'dep1',
      name: 'Test Org 1'
    })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: 'dep1' })
    assert.deepEqual(dataset.publicationSites, ['data-fair-portals:portal1'])
    const newPermissions = (await ax.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

  test('user can do everything in his own account', async () => {
    const dataset = (await testUser1.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Test User1')
    await testUser1.get(`/api/v1/datasets/${dataset.id}`)
    await testUser1.get(`/api/v1/datasets/${dataset.id}/lines`)
    await testUser1.get(`/api/v1/datasets/${dataset.id}/permissions`)
    await testUser1.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await testUser1.post('/api/v1/applications', { title: 'An application', url: mockAppUrl('monapp1') })).data
    await testUser1.get(`/api/v1/applications/${application.id}`)
  })

  test('organization admin can do everything', async () => {
    const dataset = (await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Test Org 1')
    await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)
    await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    await testUser1Org.delete(`/api/v1/datasets/${dataset.id}`)

    const application = (await testUser1Org.post('/api/v1/applications', { title: 'An application', url: mockAppUrl('monapp1') })).data
    await testUser1Org.get(`/api/v1/applications/${application.id}`)
    await testUser1Org.delete(`/api/v1/applications/${application.id}`)
  })

  test('organization contrib has limited capabilities', async () => {
    // can create a dataset and use it, but not administrate it
    const dataset = (await testUser5Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Test Org 1')
    await testUser5Org.get(`/api/v1/datasets/${dataset.id}`)
    await testUser5Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    await assert.rejects(
      testUser5Org.get(`/api/v1/datasets/${dataset.id}/permissions`),
      { status: 403 }
    )

    // can create an application and use it
    const application = (await testUser5Org.post('/api/v1/applications', { title: 'An application', url: mockAppUrl('monapp1') })).data
    await testUser5Org.get(`/api/v1/applications/${application.id}`)

    // cannot patch settings
    await assert.rejects(testUser5Org.put('/api/v1/settings/organization/test_org1', { topics: [] }), { status: 403 })
  })

  test('organization user has even more limited capabilities', async () => {
    await assert.rejects(testUser8Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), (err: any) => err.status === 403)
    const dataset = (await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.name, 'Test Org 1')
    const datasets = (await testUser8Org.get('/api/v1/datasets')).data
    assert.equal(datasets.count, 0)
    await assert.rejects(testUser8Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(testUser8Org.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 403)
    await assert.rejects(testUser8Org.get(`/api/v1/datasets/${dataset.id}/permissions`), (err: any) => err.status === 403)
    await assert.rejects(testUser8Org.get(`/api/v1/datasets/${dataset.id}/journal`), (err: any) => err.status === 403)
    await assert.rejects(testUser8Org.delete(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)

    await assert.rejects(testUser8Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' }), (err: any) => err.status === 403)
    const application = (await testUser1Org.post('/api/v1/applications', { title: 'An application', url: mockAppUrl('monapp1') })).data
    await assert.rejects(testUser8Org.get(`/api/v1/applications/${application.id}`), (err: any) => err.status === 403)
    await assert.rejects(testUser8Org.delete(`/api/v1/applications/${application.id}`), (err: any) => err.status === 403)

    // cannot patch settings
    await assert.rejects(testUser8Org.put('/api/v1/settings/organization/test_org1', { topics: [] }), { status: 403 })
  })

  test('departments can be used to restrict contrib capabilities', async () => {
    // dataset is not attached to specific department at first
    const dataset = (await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, undefined)

    // admin in org without department restriction -> ok for read and write
    await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)
    const initialPermissions = (await testUser1Org.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
    assert.equal(initialPermissions.length, 2)
    assert.deepEqual(initialPermissions, [{
      type: 'organization',
      id: 'test_org1',
      name: 'Test Org 1',
      department: '-',
      operations: ['delete'],
      roles: ['contrib'],
      classes: ['write']
    }, {
      type: 'organization',
      id: 'test_org1',
      name: 'Test Org 1',
      department: '-',
      operations: [],
      roles: ['contrib'],
      classes: ['list', 'read', 'readAdvanced']
    }])
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // outside user -> ko
    await assert.rejects(testUser6.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    // contrib from any department does not have owner privilege if the resource does not belong to any department
    await assert.rejects(testUser10Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(testUser10Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
    await assert.rejects(testUser6Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
    // switch ownership to a specific department
    await testUser1Org.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'test_org1',
      name: 'Test Org 1',
      department: 'dep1'
    })
    const newOwnerPermissions = (await testUser1Org.get(`/api/v1/datasets/${dataset.id}/permissions`)).data
    assert.deepEqual(newOwnerPermissions, [{
      type: 'organization',
      id: 'test_org1',
      name: 'Test Org 1',
      department: 'dep1',
      operations: ['delete'],
      roles: ['contrib'],
      classes: ['write']
    }, {
      type: 'organization',
      id: 'test_org1',
      name: 'Test Org 1',
      department: 'dep1',
      operations: [],
      roles: ['contrib'],
      classes: ['list', 'read', 'readAdvanced']
    }])
    // admin in org without department restriction -> ok
    await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from right department -> ok
    await testUser6Org.get(`/api/v1/datasets/${dataset.id}`)
    await testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' })
    // contrib from wrong department -> ko
    await assert.rejects(testUser10Org.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 403)
    await assert.rejects(testUser10Org.patch(`/api/v1/datasets/${dataset.id}`, { description: 'desc' }), (err: any) => err.status === 403)
  })

  test('department restriction is automatically applied', async () => {
    const dataset = (await testUser6Org.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })).data
    assert.equal(dataset.owner.department, 'dep1')
  })
})
