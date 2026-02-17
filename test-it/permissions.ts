import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, cdurning2, alone, ngernier4, ngernier4Org, ddecruce5, bhazeldean7, anonymous } from './utils/index.ts'

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
  })
})
