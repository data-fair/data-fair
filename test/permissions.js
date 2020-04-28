const assert = require('assert').strict

let datasetId

describe('permissions', () => {
  before('prepare resources', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')

    // A dataset with restricted permissions
    let res = await ax.post('/api/v1/datasets', { isRest: true, title: 'A dataset' })
    datasetId = res.data.id
    await ax.put('/api/v1/datasets/' + datasetId + '/permissions', [
      { type: 'user', id: 'ngernier4', operations: ['readDescription', 'list'] },
      { type: 'user', id: 'ddecruce5', classes: ['read'] }
    ])

    // Another one that can be read by all
    res = await ax.post('/api/v1/datasets', { isRest: true, title: 'Another dataset' })
    await ax.put('/api/v1/datasets/' + res.data.id + '/permissions', [
      { operations: ['readDescription', 'list'] }
    ])
  })

  it('No permissions', async () => {
    const ax = await global.ax.builder('cdurning2@desdev.cn:passwd')
    try {
      await ax.get('/api/v1/datasets/' + datasetId + '/api-docs.json')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('User has permissions on operationId', async () => {
    const ax = await global.ax.builder('ngernier4@usa.gov')
    const res = await ax.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
  })

  it('User has permissions on classe', async () => {
    const ax = await global.ax.builder('ddecruce5@phpbb.com')
    const res = await ax.get('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 200)
  })

  it('Read with public and private filters', async () => {
    const axAnonym = await global.ax.builder()
    let res = await axAnonym.get('/api/v1/datasets')
    assert.equal(res.data.count, 1)

    const ax = await global.ax.builder('ngernier4@usa.gov')
    res = await ax.get('/api/v1/datasets')
    assert.equal(res.data.count, 2)

    res = await ax.get('/api/v1/datasets?protected=true')
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, datasetId)

    res = await ax.get('/api/v1/datasets?public=true')
    assert.equal(res.data.count, 1)
    assert.notEqual(res.data.results[0].id, datasetId)
  })

  it('User can create a dataset for his organization', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    let res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'A dataset' }, { headers: { 'x-organizationId': 'KWqAGZ4mG' } })
    assert.equal(res.status, 201)
    await ax.put('/api/v1/datasets/' + res.data.id + '/permissions', [{ type: 'organization', id: 'KWqAGZ4mG', operations: ['readDescription'] }])
    const axRead = await global.ax.builder('bhazeldean7@cnbc.com')
    res = await axRead.get('/api/v1/datasets/' + res.data.id)
    assert.equal(res.status, 200)
  })
})
