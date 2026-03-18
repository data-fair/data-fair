import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser3 = await axiosAuth('test_user3@test.com')
const testAlone = await axiosAuth('test_alone@test.com')

test.describe('REST datasets with owner specific lines', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Create empty REST dataset with activated line ownership', async () => {
    // the dataset is created in an organization
    let res = await testUser1Org.post('/api/v1/datasets', {
      isRest: true,
      title: 'a rest dataset',
      rest: { lineOwnership: true, history: true },
      schema: [{ key: 'col1', type: 'string' }]
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset')
    let dataset = res.data
    assert.ok(dataset.schema.find((p: any) => p.key === '_owner'))
    assert.ok(dataset.schema.find((p: any) => p.key === '_ownerName'))
    assert.equal(dataset.schema.length, 7)

    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 0)

    // owner's admin can use routes to manage his own lines
    await testUser1Org.post(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`, { _id: 'dmeadusline', col1: 'value 1' })
    dataset = await waitForFinalize(testUser1Org, dataset.id)
    assert.equal(dataset.schema.length, 7)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`)
    assert.equal(res.data.total, 1)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'dmeadusline')

    // even owner's admin cannot use routes dedicated for other uses
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`), (err: any) => err.status === 403)

    // external user cannot do anything yet
    await assert.rejects(testUser3.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 403)
    await assert.rejects(testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`), (err: any) => err.status === 403)

    // give permission to external users to manage his own lines in the dataset
    await testUser1Org.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { type: 'user', id: 'test_user3', classes: ['manageOwnLines'], operations: ['readSafeSchema'] },
      { type: 'user', id: 'test_alone', classes: ['manageOwnLines'], operations: ['readSafeSchema'] }
    ])

    // external user cannot read all lines, but he can read his own lines
    await assert.rejects(testUser3.get(`/api/v1/datasets/${dataset.id}/lines`), (err: any) => err.status === 403)
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`)
    assert.equal(res.data.total, 0)
    await testUser3.post(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`, { _id: 'cdurningline', col1: 'value 1' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'cdurningline')

    // other external user can also manage his lines
    await testAlone.post(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines`, { _id: 'aloneline', col1: 'value 1' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'aloneline')
    res = await testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`)
    assert.equal(res.data._id, 'aloneline')
    // he cannot see line of another user
    await assert.rejects(testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`), (err: any) => err.status === 403)
    await assert.rejects(testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/cdurningline`), (err: any) => err.status === 404)
    // he can patch his lines but cannot change ownership
    await testAlone.patch(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`, { col1: 'value 2' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`)
    assert.equal(res.data.col1, 'value 2')
    await testAlone.patch(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`, { _owner: 'user:test_user3', col1: 'value 3' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`)
    assert.equal(res.data.col1, 'value 3')
    assert.equal(res.data._owner, 'user:test_alone')

    // owner's admin can see all lines
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)

    // owner's admin can change line ownership
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}/lines/aloneline`, { _owner: 'user:test_user3', col1: 'value 4' })
    await waitForFinalize(testUser1Org, dataset.id)
    await assert.rejects(testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines/aloneline`), (err: any) => err.status === 404)
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines/aloneline`)
    assert.equal(res.data.col1, 'value 4')
    assert.equal(res.data._owner, 'user:test_user3')

    // the revisions are also filtered on owner
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines/aloneline/revisions`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._owner, 'user:test_user3')
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines/aloneline/revisions`)
    assert.equal(res.data.total, 4)
    assert.equal(res.data.results[0]._owner, 'user:test_user3')
    assert.equal(res.data.results[1]._owner, 'user:test_alone')

    // give permission to ALL external users to manage their own lines in the dataset
    await testUser1Org.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { type: 'user', id: '*', classes: ['manageOwnLines'], operations: ['readSafeSchema'] }
    ])
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/own/user:test_user3/lines`)

    // safe schema for external users is purged of indices about the data
    res = await testUser3.get(`/api/v1/datasets/${dataset.id}/safe-schema`)
    assert.equal(res.data.find((p: any) => p.key === 'col1')['x-cardinality'], undefined)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/schema`)
    assert.equal(res.data.find((p: any) => p.key === 'col1')['x-cardinality'], 2)
    await assert.rejects(testUser3.get(`/api/v1/datasets/${dataset.id}/schema`), (err: any) => err.status === 403)
  })

  test('Handle a dataset with line ownership and a primary key that includes _owner', async () => {
    // the dataset is created in an organization
    let res = await testUser1Org.post('/api/v1/datasets', {
      isRest: true,
      title: 'a rest dataset',
      rest: { lineOwnership: true, history: true },
      schema: [{ key: 'col1', type: 'string' }, { key: 'col2', type: 'string' }],
      primaryKey: ['col1', '_owner']
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset')
    let dataset = res.data
    assert.ok(dataset.schema.find((p: any) => p.key === '_owner'))
    assert.ok(dataset.schema.find((p: any) => p.key === '_ownerName'))
    assert.equal(dataset.schema.length, 8)

    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 0)

    // owner's admin can use routes to post the same line multiple times
    await testUser1Org.post(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`, { col1: 'value 1', col2: 'Label 1' })
    dataset = await waitForFinalize(testUser1Org, dataset.id)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`)
    assert.equal(res.data.total, 1)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.ok(res.data.results[0]._id)
    await testUser1Org.post(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`, { col1: 'value 1', col2: 'Label 2' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col1, 'value 1')
    assert.equal(res.data.results[0].col2, 'Label 2')
    await testUser1Org.post(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`, { col1: 'value 2', col2: 'Label 3' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[1].col1, 'value 1')
    assert.equal(res.data.results[1].col2, 'Label 2')
    assert.equal(res.data.results[0].col1, 'value 2')
    assert.equal(res.data.results[0].col2, 'Label 3')

    // give permission to external users to manage his own lines in the dataset
    await testUser1Org.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { type: 'user', id: 'test_alone', classes: ['manageOwnLines'], operations: ['readSafeSchema'] }
    ])

    await testAlone.post(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines`, { col1: 'value 1', col2: 'Label 4' })
    await waitForFinalize(testUser1Org, dataset.id)
    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/own/user:test_user1/lines`)
    assert.equal(res.data.total, 2)
    res = await testAlone.get(`/api/v1/datasets/${dataset.id}/own/user:test_alone/lines`)
    assert.equal(res.data.total, 1)

    res = await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
  })
})
