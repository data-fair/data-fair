import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axios, axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, waitForDatasetError, restCollectionCount, restCollectionFindOne, restCollectionUpdateOne } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser2 = await axiosAuth('test_user2@test.com')
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('REST datasets - CRUD', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Create empty REST datasets', async () => {
    const ax = testUser1

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

  test('Perform CRUD operations on REST datasets', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
    await waitForFinalize(ax, 'rest1')
    assert.equal(res.status, 201)
    assert.ok(res.data._id)
    assert.equal(res.data.attr1, 'test1')
    res = await ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    await waitForFinalize(ax, 'rest1')
    assert.equal(res.data._id, 'id1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test1')
    await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
    await waitForFinalize(ax, 'rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test2')
    await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
    await waitForFinalize(ax, 'rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test3')
    assert.equal(res.data.attr2, 'test2')
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'create' }), (err: any) => err.status === 409)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'create' }), (err: any) => err.status === 409)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { _i: 10 }), (err: any) => err.status === 400)

    await ax.delete('/api/v1/datasets/rest1/lines/id1')
    await waitForFinalize(ax, 'rest1')
    await assert.rejects(ax.get('/api/v1/datasets/rest1/lines/id1'), (err: any) => err.status === 404)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4' }), (err: any) => err.status === 404)
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'update' }), (err: any) => err.status === 404)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'update' }), (err: any) => err.status === 404)
  })

  test('Patch with empty string and null should remove properties', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/restpatchempty', {
      isRest: true,
      title: 'restpatchempty',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/restpatchempty/lines', { _id: 'line1', attr1: 'test1', attr2: 'test1' })
    await waitForFinalize(ax, 'restpatchempty')

    // patch with empty string should remove the property
    res = await ax.patch('/api/v1/datasets/restpatchempty/lines/line1', { attr1: '' })
    await waitForFinalize(ax, 'restpatchempty')
    res = await ax.get('/api/v1/datasets/restpatchempty/lines/line1')
    assert.equal(res.data.attr1, undefined, 'empty string patch should remove property')
    assert.equal(res.data.attr2, 'test1', 'attr2 should be unchanged')

    // patch with null should also remove the property
    res = await ax.patch('/api/v1/datasets/restpatchempty/lines/line1', { attr2: null })
    await waitForFinalize(ax, 'restpatchempty')
    res = await ax.get('/api/v1/datasets/restpatchempty/lines/line1')
    assert.equal(res.data.attr1, undefined, 'attr1 should still be removed')
    assert.equal(res.data.attr2, undefined, 'null patch should remove property')

    // also test in bulk
    await ax.post('/api/v1/datasets/restpatchempty/lines', { _id: 'line2', attr1: 'val1', attr2: 'val2' })
    await waitForFinalize(ax, 'restpatchempty')
    res = await ax.post('/api/v1/datasets/restpatchempty/_bulk_lines', [
      { _action: 'patch', _id: 'line2', attr1: '', attr2: null }
    ])
    await waitForFinalize(ax, 'restpatchempty')
    res = await ax.get('/api/v1/datasets/restpatchempty/lines/line2')
    assert.equal(res.data.attr1, undefined, 'bulk patch: empty string should remove property')
    assert.equal(res.data.attr2, undefined, 'bulk patch: null should remove property')
  })

  test('Reject properly json missing content-type', async () => {
    const ax = testUser1
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

  test('Perform CRUD operations in bulks', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', [
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
    await waitForFinalize(ax, 'rest2')
    assert.equal(res.data.nbOk, 9)
    assert.equal(res.data.nbCreated, 5)
    assert.equal(res.data.nbDeleted, 1)
    assert.ok(res.data.indexedAt)

    await assert.rejects(
      ax.get('/api/v1/datasets/rest2/lines/line2'),
      { status: 404 }
    )
    res = await ax.get('/api/v1/datasets/rest2/lines/line3')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test1')
    res = await ax.get('/api/v1/datasets/rest2/lines/line4')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test2')
    res = await ax.get('/api/v1/datasets/rest2/lines/line5')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, undefined)
  })

  test('Index and finalize dataset after write', async () => {
    // Load a few lines
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest3', {
      isRest: true,
      title: 'rest3',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/rest3/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    let dataset = await waitForFinalize(ax, 'rest3')
    assert.ok(dataset.schema.find((f: any) => f.key === '_id'))
    assert.ok(dataset.schema.find((f: any) => f.key === '_updatedAt'))
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 4)

    // check that _i is incremental and unique even inside the same bulk
    assert.equal(res.data.results[0]._i, res.data.results[1]._i + 1)
    assert.equal(res.data.results[1]._i, res.data.results[2]._i + 1)
    assert.equal(res.data.results[2]._i, res.data.results[3]._i + 1)
    assert.equal(res.data.results[0]._id, 'line4')
    assert.equal(res.data.results[1]._id, 'line3')
    assert.equal(res.data.results[2]._id, 'line2')
    assert.equal(res.data.results[3]._id, 'line1')

    // Patch one through db query to check that it won't be processed
    // we must be sure that the whole dataset is not reindexed each time, only the diffs
    await restCollectionUpdateOne('rest3', { _id: 'line4' }, { $set: { attr2: 'altered' } })
    assert.equal((await restCollectionFindOne('rest3', { _id: 'line4' })).attr2, 'altered')

    res = await ax.post('/api/v1/datasets/rest3/_bulk_lines?async=true', [
      { _action: 'delete', _id: 'line1' },
      { _action: 'patch', _id: 'line2', attr1: 'test2' }
    ])
    assert.equal(await restCollectionCount('rest3', { _needsIndexing: true }), 2)

    dataset = await waitForFinalize(ax, 'rest3')
    assert.equal(dataset.updatedAt, dataset.createdAt)
    assert.ok(dataset.dataUpdatedAt > dataset.updatedAt)
    assert.ok(dataset.finalizedAt > dataset.dataUpdatedAt)
    assert.equal(await restCollectionCount('rest3', { _needsIndexing: true }), 0)
    assert.equal(dataset.count, 3)
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 3)
    const line4 = res.data.results.find((r: any) => r._id === 'line4')
    assert.equal(line4.attr2, 'test1')
  })

  test('Reindex after an error', async () => {
    // Load a few lines
    const ax = testUser1
    await ax.put('/api/v1/datasets/trigger-test-error', {
      isRest: true,
      title: 'trigger test error',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/trigger-test-error/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    let dataset = await waitForFinalize(ax, 'trigger-test-error')
    await testSuperadmin.post('/api/v1/datasets/trigger-test-error/_reindex')
    // wait for error status after reindex with trigger-test-error slug
    await waitForDatasetError(ax, 'trigger-test-error')
    dataset = await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    assert.equal(dataset.status, 'error')
    let journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'error')
    await ax.patch('/api/v1/datasets/trigger-test-error', { slug: 'test-no-trigger' })
    await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    dataset = await waitForFinalize(ax, 'trigger-test-error')
    assert.equal(dataset.status, 'finalized')
    journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'finalize-end')
  })

  test('Use dataset schema to validate inputs', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest4', {
      isRest: true,
      title: 'rest4',
      schema: [
        { key: 'attr1', type: 'string', 'x-required': true },
        { key: 'attr2', type: 'string', pattern: '^test[0-9]$' },
        { key: 'attr3', type: 'string', pattern: '^test[0-9]$', separator: ', ' },
        { key: 'attr4', type: 'string', 'x-labels': { val1: 'Label 1', val2: 'Label 2' }, 'x-labelsRestricted': true },
      ]
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attrko: 'test1' }), (err: any) => {
      assert.equal(err.data, 'ne doit pas contenir de propriétés additionnelles (attrko)')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', _attrko: 'test1' }), (err: any) => {
      assert.equal(err.data, 'ne doit pas contenir de propriétés additionnelles (_attrko)')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 111 }), (err: any) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 'test', attr2: 'test1' })

    await assert.rejects(ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 111 }), (err: any) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.patch('/api/v1/datasets/rest4/lines/line1', { attr1: 111 }), (err: any) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.patch('/api/v1/datasets/rest4/lines/line1', { attr2: 'testko' }), (err: any) => {
      assert.ok(err.data.startsWith('/attr2 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr2: 'test1' }), (err: any) => {
      assert.ok(err.data.startsWith('requiert la propriété attr1'))
      assert.equal(err.status, 400)
      return true
    })

    let res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
      { _id: 'line1', attr1: 'test' },
      { _id: 'line1', attr1: 111 }
    ])

    assert.equal(res.data.nbOk, 1)
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.errors.length, 1)
    assert.equal(res.data.errors[0].line, 1)
    assert.equal(res.data.errors[0].error, '/attr1 doit être de type string')

    let line = await ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: 'test1, test2' }).then(r => r.data)
    assert.equal(line.attr3, 'test1, test2')
    line = await ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: ['test1', 'test2'] }).then(r => r.data)
    assert.deepEqual(line.attr3, ['test1', 'test2'])
    const form = new FormData()
    form.append('attr1', 'test')
    form.append('attr3', 'test1, test2')
    line = await ax.post('/api/v1/datasets/rest4/lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }).then(r => r.data)
    assert.equal(line.attr3, 'test1, test2')

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: 'test1, testko' }), (err: any) => {
      assert.ok(err.data.startsWith('/attr3/1 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: ['test1', 'testko'] }), (err: any) => {
      assert.ok(err.data.startsWith('/attr3/1 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })
    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', `attr1,attr2,attr3,attr4
test1,test1,test1,""
test1,,"test1, test2",""
test1,test1,"test1, testko",""
test1,,"test1, ",""
test1,,"",val1
test1,,"",valko`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbOk, 4)
    assert.equal(res.data.nbErrors, 2)
    assert.equal(res.data.errors.length, 2)
    assert.equal(res.data.errors[0].line, 2)
    assert.ok(res.data.errors[0].error.startsWith('/attr3/1 doit correspondre au format'))
    assert.equal(res.data.errors[1].line, 5)
    assert.ok(res.data.errors[1].error.endsWith('/attr4 doit correspondre à exactement un schéma de "oneOf"'))

    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test1', attr3: 'test1, test2' },
      { attr1: 'test1', attr2: 'test1', attr3: ['test1', 'test2'] },
      { attr1: 'test1', attr2: 'test1', attr3: 'test1, testko' },
      { attr1: 'test1', attr2: 'test1', attr3: '' }
    ])
    assert.equal(res.data.nbOk, 4)
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.errors.length, 1)
    assert.equal(res.data.errors[0].line, 3)
    assert.ok(res.data.errors[0].error.startsWith('/attr3/1 doit correspondre au format'))

    const lines = await ax.get('/api/v1/datasets/rest4/lines').then(r => r.data.results)
    line = lines.find((l: any) => l.attr3 === 'test1, test2')
    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [{ _action: 'patch', _id: line._id, attr1: 'patched1' }])
    assert.equal(res.data.nbOk, 1)

    // on older datasets that multivalued data was stored with separator, we simulate this situation
    await restCollectionUpdateOne('rest4', { _id: line._id }, { $set: { attr3: 'test1, test2' } })
    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [{ _action: 'patch', _id: line._id, attr1: 'patched1' }])
    assert.equal(res.data.nbOk, 1)

    await waitForFinalize(ax, 'rest4')
  })

  test('Use nonBlockingValidation option', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest4', {
      isRest: true,
      title: 'rest4',
      nonBlockingValidation: true,
      schema: [{ key: 'attr1', type: 'string', 'x-required': true }, { key: 'attr2', type: 'string', pattern: '^test[0-9]$' }]
    })

    const resPost = await ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: 'test1' })
    assert.equal(resPost.data._warning, 'ne doit pas contenir de propriétés additionnelles (attr3)')

    const res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
      { _id: 'line1', attr1: 'test' },
      { _id: 'line1', attr1: 111 }
    ])

    assert.equal(res.data.nbOk, 2)
    assert.equal(res.data.nbWarnings, 1)
    assert.equal(res.data.warnings.length, 1)
    assert.equal(res.data.warnings[0].line, 1)
    assert.equal(res.data.warnings[0].warning, '/attr1 doit être de type string')

    await waitForFinalize(ax, 'rest4')
  })

  test('The size of the mongodb collection is part of storage consumption', async () => {
    // Load a few lines
    const ax = testUser2
    await ax.post('/api/v1/datasets/rest7', {
      isRest: true,
      title: 'rest7',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest7/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'rest7')

    let res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    const storageSize = res.data.limits.store_bytes.consumption
    assert.ok(storageSize > 350)
    res = await ax.get('/api/v1/datasets/rest7')
    assert.equal(res.data.storage.size, storageSize)
    assert.equal(res.data.storage.indexed.size, storageSize)
    assert.equal(res.data.storage.collection.size, storageSize)
  })

  test('Applying the exact same data twice does not trigger indexing', async () => {
    // Load a few lines
    const ax = testUser1
    await ax.put('/api/v1/datasets/restidem', {
      isRest: true,
      title: 'restidem',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let res = await ax.post('/api/v1/datasets/restidem/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'restidem')
    res = await ax.get('/api/v1/datasets/restidem/lines')
    assert.equal(res.data.total, 4)

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'restidem')
    assert.equal(await restCollectionCount('restidem', { _needsIndexing: true }), 0)

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _action: 'delete', _id: 'line2' }
    ])
    assert.equal(await restCollectionCount('restidem', { _needsIndexing: true }), 1)
    await waitForFinalize(ax, 'restidem')

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'patch', _id: 'line4', attr1: 'test1' }
    ])
    assert.equal(await restCollectionCount('restidem', { _needsIndexing: true }), 1)
    await waitForFinalize(ax, 'restidem')
    res = await ax.get('/api/v1/datasets/restidem')
    assert.equal(res.data.count, 3)
  })

  test('Delete all lines from a rest dataset', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restdel', {
      isRest: true,
      title: 'restdel',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restdel/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'restdel')
    res = await ax.get('/api/v1/datasets/restdel')
    assert.equal(res.data.count, 4)

    await ax.delete('/api/v1/datasets/restdel/lines')
    await waitForFinalize(ax, 'restdel')
    res = await ax.get('/api/v1/datasets/restdel')
    assert.equal(res.data.count, 0)
    assert.equal(await restCollectionCount('restdel', {}), 0)
  })

  test('Accept date detected as ISO by JS but not by elasticsearch', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restdate', {
      isRest: true,
      title: 'restdate',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    await ax.post('/api/v1/datasets/restdate/lines', { attr1: '1961-02-13 00:00:00+00:00' })
    await waitForFinalize(ax, 'restdate')
    let lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: '1961-02-14 00:00:00+00:00' })
    await waitForFinalize(ax, 'restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-14T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: null })
    await waitForFinalize(ax, 'restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.ok(!lines[0].attr1)
  })

  test('Ignore null values', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restnull', {
      isRest: true,
      title: 'restnull',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restnull/lines', { attr1: 'val1', attr2: null })
    await waitForFinalize(ax, 'restnull')
    const lines = (await ax.get('/api/v1/datasets/restnull/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, 'val1')
    assert.ok(!('attr2' in lines[0]))
  })

  test.skip('Send multiple lines in parallel', async () => {
    // activate temporarily to check that we manage correctly parallel insertions
    // it is also necessary to change defaultLimits.apiRate.user.nb to support this number of requests

    const ax = testUser1
    await ax.post('/api/v1/datasets/restparallel', {
      isRest: true,
      // rest: { indiceMode: 'timestamp1' },
      title: 'restparallel',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const promises = []
    for (let i = 0; i < 900; i++) {
      promises.push(ax.post('/api/v1/datasets/restparallel/lines', { attr1: 'val1', attr2: 'val2' }))
    }
    const responses = await Promise.all(promises)
    console.log(responses.map(r => r.status).filter(s => s !== 201))
  })

  test('Accept date detected as ISO by JS but not by elasticsearch in bulk', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restdatebulk', {
      isRest: true,
      title: 'restdatebulk',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [
      { _id: '1', attr1: '1961-02-13 00:00:00+00:00', attr2: 'val1' },
      { _id: '2', attr1: '1961-02-13T00:00:00+00:00', attr2: 'val2' }
    ])
    await waitForFinalize(ax, 'restdatebulk')
    let lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[0].attr2, 'val2')
    assert.equal(lines[1].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[1].attr2, 'val1')

    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [{ _id: lines[0]._id, attr1: null, _action: 'patch' }])
    await waitForFinalize(ax, 'restdatebulk')
    lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.ok(!lines[0].attr1)
    assert.equal(lines[0].attr2, 'val2')
  })

  test('Accept date detected as ISO by JS but not by elasticsearch in bulk CSV', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    const res = await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1
    line1,1961-02-13 00:00:00+00:00`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 1)
    await waitForFinalize(ax, 'restcsv')
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
  })

  test('Removing a property triggers mongo unset and reindexing', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/restunset', {
      isRest: true,
      title: 'restunset',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/restunset/lines', { attr1: 'test1', attr2: 'test1' })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, 'restunset')
    res = await ax.get('/api/v1/datasets/restunset')
    const storage1 = res.data.storage.size

    await doAndWaitForFinalize(ax, 'restunset', () => ax.patch('/api/v1/datasets/restunset', { schema: [{ key: 'attr1', type: 'string', readOnly: true }] }))
    res = await ax.get('/api/v1/datasets/restunset')
    const storage2 = res.data.storage.size
    assert.ok(storage2 < storage1)

    res = await ax.get('/api/v1/datasets/restunset/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0].attr2)
  })

  test('Activating/deactivating storeUpdatedBy', async () => {
    const ax = testUser1Org
    let res = await ax.post('/api/v1/datasets/updatedby', {
      isRest: true,
      title: 'updatedby',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test1' })
    await waitForFinalize(ax, 'updatedby')

    await doAndWaitForFinalize(ax, 'updatedby', () => ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true } }))

    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0]._updatedBy)
    const lineId = res.data.results[0]._id

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await waitForFinalize(ax, 'updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.equal(res.data.results[0]._updatedBy, 'test_user1')
    assert.equal(res.data.results[0]._updatedByName, 'Test User1')

    res = await ax.put('/api/v1/settings/organization/test_org1', { apiKeys: [{ title: 'api key', scopes: ['datasets'] }] })
    const apiKey = res.data.apiKeys[0]
    const axAPIKey = axios({ headers: { 'x-apiKey': apiKey.clearKey } })
    await axAPIKey.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test3' })
    await waitForFinalize(ax, 'updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.equal(res.data.results[0]._updatedBy, 'apiKey:' + apiKey.id)
    assert.equal(res.data.results[0]._updatedByName, 'api key')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true, history: true } })
    await waitForFinalize(ax, 'updatedby')

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await waitForFinalize(ax, 'updatedby')
    res = await ax.get(`/api/v1/datasets/updatedby/lines/${lineId}/revisions`)
    assert.equal(res.data.results[0]._updatedBy, 'test_user1')
    assert.equal(res.data.results[0]._updatedByName, 'Test User1')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: false, history: true } })
    await waitForFinalize(ax, 'updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(!res.data.results[0]._updatedBy)
    assert.ok(!res.data.results[0]._updatedByName)
  })
})
