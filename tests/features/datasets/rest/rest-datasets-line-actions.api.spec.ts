import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('REST datasets - single line _action', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('POST a single line with _action delete and patch by _id', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restaction1', {
      isRest: true,
      title: 'restaction1',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/restaction1/lines', { _id: 'line1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.status, 200) // caller-defined _id -> 200, generated id -> 201 (existing behavior)
    await waitForFinalize(ax, 'restaction1')

    // patch merges with the existing line
    res = await ax.post('/api/v1/datasets/restaction1/lines', { _action: 'patch', _id: 'line1', attr1: 'test2' })
    assert.equal(res.status, 200)
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test1')
    await waitForFinalize(ax, 'restaction1')
    res = await ax.get('/api/v1/datasets/restaction1/lines/line1')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test1')

    // patch of a missing line -> 404
    await assert.rejects(ax.post('/api/v1/datasets/restaction1/lines', { _action: 'patch', _id: 'missing', attr1: 'x' }), (err: any) => err.status === 404)

    // delete responds 204 with no content
    res = await ax.post('/api/v1/datasets/restaction1/lines', { _action: 'delete', _id: 'line1' })
    assert.equal(res.status, 204)
    assert.equal(res.data, '')
    await waitForFinalize(ax, 'restaction1')
    await assert.rejects(ax.get('/api/v1/datasets/restaction1/lines/line1'), (err: any) => err.status === 404)

    // delete of a missing line -> 404
    await assert.rejects(ax.post('/api/v1/datasets/restaction1/lines', { _action: 'delete', _id: 'line1' }), (err: any) => err.status === 404)

    // unknown action -> 400
    await assert.rejects(ax.post('/api/v1/datasets/restaction1/lines', { _action: 'nope', _id: 'line1' }), (err: any) => err.status === 400)
  })

  test('POST a single line with _action resolved by primary key', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restaction2', {
      isRest: true,
      title: 'restaction2',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/restaction2/lines', { attr1: 'key1', attr2: 'test1' })
    await waitForFinalize(ax, 'restaction2')
    const lineId = res.data._id
    assert.ok(lineId)

    // patch by primary key, no _id in the body
    res = await ax.post('/api/v1/datasets/restaction2/lines', { _action: 'patch', attr1: 'key1', attr2: 'test2' })
    assert.equal(res.status, 200)
    assert.equal(res.data._id, lineId)
    assert.equal(res.data.attr2, 'test2')
    await waitForFinalize(ax, 'restaction2')

    // update by primary key
    res = await ax.post('/api/v1/datasets/restaction2/lines', { _action: 'update', attr1: 'key1', attr2: 'test3' })
    assert.equal(res.status, 200)
    assert.equal(res.data._id, lineId)
    await waitForFinalize(ax, 'restaction2')

    // delete by primary key
    res = await ax.post('/api/v1/datasets/restaction2/lines', { _action: 'delete', attr1: 'key1' })
    assert.equal(res.status, 204)
    await waitForFinalize(ax, 'restaction2')
    await assert.rejects(ax.get('/api/v1/datasets/restaction2/lines/' + lineId), (err: any) => err.status === 404)
  })

  test('POST _action without resolvable _id is rejected', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restaction3', {
      isRest: true,
      title: 'restaction3',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    // no primary key and no _id -> impossible to target a line
    for (const _action of ['patch', 'update', 'delete']) {
      await assert.rejects(ax.post('/api/v1/datasets/restaction3/lines', { _action, attr1: 'x' }), (err: any) => err.status === 400)
    }
  })

  test('PUT and PATCH line routes refuse out-of-place actions', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restaction4', {
      isRest: true,
      title: 'restaction4',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restaction4/lines', { _id: 'line1', attr1: 'test1' })
    await waitForFinalize(ax, 'restaction4')

    // PUT keeps replace-shaped actions (see rest-datasets-crud.api.spec.ts) but refuses patch/delete
    await assert.rejects(ax.put('/api/v1/datasets/restaction4/lines/line1', { _action: 'patch', attr1: 'x' }), (err: any) => err.status === 400)
    await assert.rejects(ax.put('/api/v1/datasets/restaction4/lines/line1', { _action: 'delete' }), (err: any) => err.status === 400)
    // PATCH refuses any action but patch
    await assert.rejects(ax.patch('/api/v1/datasets/restaction4/lines/line1', { _action: 'delete' }), (err: any) => err.status === 400)
    await assert.rejects(ax.patch('/api/v1/datasets/restaction4/lines/line1', { _action: 'createOrUpdate', attr1: 'x' }), (err: any) => err.status === 400)
    // the line survived all of the above
    const res = await ax.get('/api/v1/datasets/restaction4/lines/line1')
    assert.equal(res.data.attr1, 'test1')
  })
})
