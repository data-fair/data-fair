const assert = require('assert').strict
const workers = require('../server/workers')

describe('permissions', () => {
  it('apply permissions to datasets', async () => {
    // A dataset with restricted permissions
    let res = await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    await global.ax.dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'ddecruce5', classes: ['read'] },
      { type: 'user', email: 'alone@no.org', classes: ['list', 'read', 'write'] },
      { type: 'user', id: 'bhazeldean7', classes: ['list', 'read'] }
    ])

    // Another one that can be read by all
    res = await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'Another dataset' })
    await global.ax.dmeadus.put('/api/v1/datasets/' + res.data.id + '/permissions', [
      { operations: ['readDescription', 'list'] }
    ])

    // No permissions
    try {
      await global.ax.cdurning2.get('/api/v1/datasets/' + datasetId + '/api-docs.json')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // User has permissions on operationId
    res = await global.ax.ngernier4.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User level permission applies also if he is switched in an organization account
    res = await global.ax.ngernier4Org.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permissions on class
    res = await global.ax.ddecruce5.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

    // User has permission given using only his email
    res = await global.ax.alone.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await global.ax.alone.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await global.ax.alone.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 1)
    res = await global.ax.alone.get('/api/v1/datasets?can=admin')
    assert.equal(res.data.count, 0)

    // Member has individual permission
    res = await global.ax.bhazeldean7.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
    res = await global.ax.bhazeldean7.get('/api/v1/datasets?can=read')
    assert.equal(res.data.count, 1)
    res = await global.ax.bhazeldean7.get('/api/v1/datasets?can=write')
    assert.equal(res.data.count, 0)

    // Read with public and private filters
    res = await global.ax.anonymous.get('/api/v1/datasets')
    assert.equal(res.data.count, 1)

    res = await global.ax.ngernier4.get('/api/v1/datasets')
    assert.equal(res.data.count, 2)

    res = await global.ax.ngernier4.get('/api/v1/datasets?protected=true')
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, datasetId)

    res = await global.ax.ngernier4.get('/api/v1/datasets?public=true')
    assert.equal(res.data.count, 1)
    assert.notEqual(res.data.results[0].id, datasetId)

    // User can create a dataset for his organization
    res = await global.ax.dmeadusOrg.post('/api/v1/datasets', { isVirtual: true, title: 'A dataset' })
    assert.equal(res.status, 201)
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + res.data.id + '/permissions', [{ type: 'user', id: 'cdurning2', operations: ['readDescription'] }])
    res = await global.ax.dmeadusOrg.get('/api/v1/datasets/' + res.data.id)
    assert.equal(res.status, 200)
    res = await global.ax.cdurning2.get('/api/v1/datasets/' + res.data.id)
    assert.equal(res.status, 200)
    // the owner user, but with different active account
    try {
      await global.ax.dmeadus.get('/api/v1/datasets/' + res.data.id + '/api-docs.json')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('apply permissions to datasets in organization and departments', async () => {
    // A dataset made accessible to all users of owner organization
    const res = await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await global.ax.bhazeldean7Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(global.ax.bhazeldean7Org.get('/api/v1/datasets/' + datasetId), err => err.status === 403)
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: '-', classes: ['list', 'read'] }
    ])
    assert.equal((await global.ax.bhazeldean7Org.get('/api/v1/datasets')).data.count, 1)
    await global.ax.bhazeldean7Org.get('/api/v1/datasets/' + datasetId)
    await assert.rejects(global.ax.bhazeldean7.get('/api/v1/datasets/' + datasetId), err => err.status === 403)

    // dataset made accessible to users of a departement
    assert.equal((await global.ax.ddecruce5Org.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(global.ax.ddecruce5Org.get('/api/v1/datasets/' + datasetId), err => err.status === 403)
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: 'dep1', classes: ['list', 'read'] }
    ])
    assert.equal((await global.ax.ddecruce5Org.get('/api/v1/datasets')).data.count, 1)
    await global.ax.ddecruce5Org.get('/api/v1/datasets/' + datasetId)
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'organization', id: 'KWqAGZ4mG', department: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await global.ax.ddecruce5Org.get('/api/v1/datasets')).data.count, 1)
    await global.ax.ddecruce5Org.get('/api/v1/datasets/' + datasetId)
  })

  it('apply permission to any authenticated user', async () => {
    const res = await global.ax.dmeadusOrg.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    assert.equal((await global.ax.bhazeldean7.get('/api/v1/datasets')).data.count, 0)
    await assert.rejects(global.ax.bhazeldean7.get('/api/v1/datasets/' + datasetId), err => err.status === 403)
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: '*', classes: ['list', 'read'] }
    ])
    assert.equal((await global.ax.bhazeldean7.get('/api/v1/datasets')).data.count, 1)
    await global.ax.bhazeldean7.get('/api/v1/datasets/' + datasetId)
    await global.ax.bhazeldean7Org.get('/api/v1/datasets/' + datasetId)
  })

  it('give permission to patch a dataset info except for potentiel breaking changes', async () => {
    // A dataset with restricted permissions
    let res = await global.ax.dmeadus.post('/api/v1/datasets', {
      isRest: true,
      title: 'A dataset',
      schema: [{ key: 'str', title: 'str title', type: 'string' }]
    })
    const datasetId = res.data.id
    await workers.hook('finalizer/' + datasetId)
    await global.ax.dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['writeDescription', 'readDescription'] },
      { type: 'user', id: 'ddecruce5', operations: ['writeDescriptionBreaking', 'readDescription'] }
    ])

    // permission to write except breaking changes
    res = await global.ax.ngernier4.patch('/api/v1/datasets/' + datasetId, { description: 'Description', schema: [{ key: 'str', title: 'another title', type: 'string' }] })
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'indexed')
    await workers.hook('finalizer/' + datasetId)

    await assert.rejects(
      global.ax.ngernier4.patch('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] }),
      (err) => err.status === 403
    )

    await assert.rejects(
      global.ax.ngernier4.patch('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'another title', type: 'number' }] }),
      (err) => err.status === 403
    )

    // permission to write breaking changes
    res = await global.ax.ddecruce5('/api/v1/datasets/' + datasetId, { description: 'Description' })
    assert.equal(res.status, 200)
    res = await global.ax.ddecruce5('/api/v1/datasets/' + datasetId, { primaryKey: ['test'] })
    assert.equal(res.status, 200)
    res = await global.ax.ddecruce5('/api/v1/datasets/' + datasetId, { schema: [{ key: 'str', title: 'yet another title', type: 'number' }] })
    assert.equal(res.status, 200)
  })
})
