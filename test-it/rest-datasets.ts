import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'

describe('REST datasets', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Create empty REST datasets', async function () {
    const ax = dmeadus

    let res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset')
    assert.equal(res.data.status, 'finalized')
    assert.ok(res.data.userPermissions)

    res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset-2')
    assert.equal(res.data.status, 'finalized')

    res = await ax.put('/api/v1/datasets/restdataset3', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset-3')
    assert.equal(res.data.status, 'finalized')

    res = await ax.put('/api/v1/datasets/restdataset3', { isRest: true, title: 'a rest dataset updated' })
    assert.equal(res.status, 200)
    assert.ok(!res.data.draftReason)
    assert.equal(res.data.slug, 'a-rest-dataset-3')
    assert.equal(res.data.title, 'a rest dataset updated')
  })

  it('Perform CRUD operations on REST datasets', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest1')
    assert.equal(res.status, 201)
    assert.ok(res.data._id)
    assert.equal(res.data.attr1, 'test1')
    res = await ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalize/rest1')
    assert.equal(res.data._id, 'id1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test1')
    await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
    await workers.hook('finalize/rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test2')
    await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
    await workers.hook('finalize/rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test3')
    assert.equal(res.data.attr2, 'test2')
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'create' }), (err: any) => err.status === 409)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'create' }), (err: any) => err.status === 409)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { _i: 10 }), (err: any) => err.status === 400)

    await ax.delete('/api/v1/datasets/rest1/lines/id1')
    await workers.hook('finalize/rest1')
    await assert.rejects(ax.get('/api/v1/datasets/rest1/lines/id1'), (err: any) => err.status === 404)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4' }), (err: any) => err.status === 404)
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'update' }), (err: any) => err.status === 404)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'update' }), (err: any) => err.status === 404)
  })

  it('Reject properly json missing content-type', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restjson', {
      isRest: true,
      title: 'restjson',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    await assert.rejects(ax.post('/api/v1/datasets/restjson/lines', JSON.stringify({ attr1: 'test1', attr2: 'test1' })), (err: any) => {
      assert.equal(err.status, 415)
      assert.equal(err.data, 'Cette API attend un header content-type compatible, le plus souvent application/json.')
      return true
    })
  })

  it('Perform CRUD operations in bulks', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' },
      { _id: 'line5', attr1: 'test1', attr2: 'test1' },
      { _action: 'delete', _id: 'line2' },
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'update', _id: 'line4', attr1: 'test2', attr2: 'test2' },
      { _action: 'patch', _id: 'line5', attr1: 'test2', attr2: null },
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest2')
    assert.equal(res.data.nbOk, 9)
    assert.equal(res.data.nbCreated, 5)
    assert.equal(res.data.nbDeleted, 1)
    assert.ok(res.data.indexedAt)
  })
})
