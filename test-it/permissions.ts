import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, dmeadusOrg, cdurning2, alone, ngernier4, ngernier4Org, ddecruce5, ddecruce5Org, bhazeldean7, bhazeldean7Org, anonymous } from './utils/index.ts'

describe('permissions', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('apply permissions to datasets', async function () {
    let res = await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    await dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'ddecruce5', classes: ['read'] },
      { type: 'user', email: 'alone@no.org', classes: ['list', 'read', 'write'] },
      { type: 'user', id: 'bhazeldean7', classes: ['list', 'read'] }
    ])

    res = await dmeadus.post('/api/v1/datasets', { isRest: true, title: 'Another dataset' })
    await dmeadus.put('/api/v1/datasets/' + res.data.id + '/permissions', [
      { operations: ['readDescription', 'list'] }
    ])

    try {
      await cdurning2.get('/api/v1/datasets/' + datasetId + '/api-docs.json')
      assert.fail()
    } catch (err: any) {
      assert.equal(err.status, 403)
    }

    res = await ngernier4.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    res = await ngernier4Org.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    res = await ddecruce5.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    res = await alone.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await alone.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await alone.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 1)
    res = await alone.get('/api/v1/datasets?can=admin')
    assert.equal(res.data.count, 0)

    res = await bhazeldean7.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await bhazeldean7.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await bhazeldean7.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 0)

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

    res = await dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId2 = res.data.id
    assert.equal(res.status, 201)
    await dmeadusOrg.put('/api/v1/datasets/' + datasetId2 + '/permissions', [{ type: 'user', id: 'cdurning2', operations: ['readDescription'] }])
    res = await dmeadusOrg.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)
    res = await cdurning2.get('/api/v1/datasets/' + datasetId2)
    assert.equal(res.status, 200)

    try {
      await dmeadus.get('/api/v1/datasets/' + datasetId2 + '/api-docs.json')
      assert.fail()
    } catch (err: any) {
      assert.equal(err.status, 403)
    }
  })

  it('apply permissions to datasets in organization and departments', async function () {
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

  it('give permission to patch a dataset info except for potencial breaking changes', async function () {
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

    res = await ddecruce5.patch('/api/v1/datasets/' + datasetId, { description: 'Description' })
    assert.equal(res.status, 200)
    res = await ddecruce5.patch('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] })
    assert.equal(res.status, 200)
    res = await ddecruce5.patch('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'yet another title', type: 'number' }] })
    assert.equal(res.status, 200)
  })
})
