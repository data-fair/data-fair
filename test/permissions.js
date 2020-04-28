const assert = require('assert').strict

describe('permissions', () => {
  it('apply permissions to datasets', async () => {
    // A dataset with restricted permissions
    let res = await global.ax.dmeadus.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    const datasetId = res.data.id
    await global.ax.dmeadus.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'ddecruce5', classes: ['read'] }
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

    // User has permissions on class
    res = await global.ax.ddecruce5.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)

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
    res = await global.ax.dmeadus.post('/api/v1/datasets', { isVirtual: true, title: 'A dataset' }, { headers: { 'x-organizationId': 'KWqAGZ4mG' } })
    assert.equal(res.status, 201)
    await global.ax.dmeadus.put('/api/v1/datasets/' + res.data.id + '/permissions', [{ type: 'organization', id: 'KWqAGZ4mG', operations: ['readDescription'] }])
    res = await global.ax.bhazeldean7.get('/api/v1/datasets/' + res.data.id)
    assert.equal(res.status, 200)
  })
})
