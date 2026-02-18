import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, superadmin, hlalonde3, ngernier4, dmeadusOrg, formHeaders } from './utils/index.ts'
import path from 'node:path'
import fs from 'fs-extra'
import FormData from 'form-data'
import moment from 'moment'
import zlib from 'zlib'
import { Writable } from 'stream'
import iconv from 'iconv-lite'
import * as restDatasetsUtils from '../api/src/datasets/utils/rest.ts'
import { attachmentsDir, lsAttachments } from '../api/src/datasets/utils/files.ts'
import pump from 'pump'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'

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

    try {
      await ax.get('/api/v1/datasets/rest2/lines/line2')
      assert.fail()
    } catch (err: any) {
      assert.equal(err.status, 404)
    }
    const resLine3 = await ax.get('/api/v1/datasets/rest2/lines/line3')
    assert.equal(resLine3.data.attr1, 'test2')
    assert.equal(resLine3.data.attr2, 'test1')
    const resLine4 = await ax.get('/api/v1/datasets/rest2/lines/line4')
    assert.equal(resLine4.data.attr1, 'test2')
    assert.equal(resLine4.data.attr2, 'test2')
    const resLine5 = await ax.get('/api/v1/datasets/rest2/lines/line5')
    assert.equal(resLine5.data.attr1, 'test2')
    assert.equal(resLine5.data.attr2, undefined)
  })

  it('Index and finalize dataset after write', async function () {
    const ax = dmeadus
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
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('finalize/rest3')
    assert.ok(dataset.schema.find((f: any) => f.key === '_id'))
    assert.ok(dataset.schema.find((f: any) => f.key === '_updatedAt'))
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 4)

    assert.equal(res.data.results[0]._i, res.data.results[1]._i + 1)
    assert.equal(res.data.results[1]._i, res.data.results[2]._i + 1)
    assert.equal(res.data.results[2]._i, res.data.results[3]._i + 1)
    assert.equal(res.data.results[0]._id, 'line4')
    assert.equal(res.data.results[1]._id, 'line3')
    assert.equal(res.data.results[2]._id, 'line2')
    assert.equal(res.data.results[3]._id, 'line1')

    const collection = restDatasetsUtils.collection(dataset as any)
    await collection.updateOne({ _id: 'line4' }, { $set: { attr2: 'altered' } })
    assert.equal((await collection.findOne({ _id: 'line4' }))?.attr2, 'altered')

    res = await ax.post('/api/v1/datasets/rest3/_bulk_lines?async=true', [
      { _action: 'delete', _id: 'line1' },
      { _action: 'patch', _id: 'line2', attr1: 'test2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 2)

    dataset = await workers.hook('finalize/rest3')
    console.log(dataset.updatedAt, dataset.createdAt)
    assert.equal(dataset.updatedAt, dataset.createdAt)
    assert.ok(dataset.dataUpdatedAt > dataset.updatedAt)
    assert.ok(dataset.finalizedAt > dataset.dataUpdatedAt)
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)
    assert.equal(dataset.count, 3)
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 3)
    const line4 = res.data.results.find((r: any) => r._id === 'line4')
    assert.equal(line4.attr2, 'test1')
  })

  it('Reindex after an error', async function () {
    const ax = dmeadus
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
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('finalize/trigger-test-error')
    await superadmin.post('/api/v1/datasets/trigger-test-error/_reindex')
    await assert.rejects(workers.hook('finalize/trigger-test-error'))
    await assert.rejects(workers.hook('finalize/trigger-test-error'))
    dataset = await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    assert.equal(dataset.status, 'error')
    let journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[1].type, 'error-retry')
    await ax.patch('/api/v1/datasets/trigger-test-error', { slug: 'test-no-trigger' })
    await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    dataset = await workers.hook('finalize/trigger-test-error')
    assert.equal(dataset.status, 'finalized')
    journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'finalize-end')
  })

  it('Use dataset schema to validate inputs', async function () {
    const ax = dmeadus
    const dataset = await ax.put('/api/v1/datasets/rest4', {
      isRest: true,
      title: 'rest4',
      schema: [
        { key: 'attr1', type: 'string', 'x-required': true },
        { key: 'attr2', type: 'string', pattern: '^test[0-9]$' },
        { key: 'attr3', type: 'string', pattern: '^test[0-9]$', separator: ', ' },
        { key: 'attr4', type: 'string', 'x-labels': { val1: 'Label 1', val2: 'Label 2' }, 'x-labelsRestricted': true },
      ]
    }).then(r => r.data)

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
    line = await ax.post('/api/v1/datasets/rest4/lines', form, { headers: formHeaders(form) }).then(r => r.data)
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

    await restDatasetsUtils.collection(dataset).updateOne({ _id: line._id }, { $set: { attr3: 'test1, test2' } })
    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [{ _action: 'patch', _id: line._id, attr1: 'patched1' }])
    assert.equal(res.data.nbOk, 1)

    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest4')
  })

  it('Use nonBlockingValidation option', async function () {
    const ax = dmeadus
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

    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest4')
  })

  it('Send attachment with multipart request', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    const form = new FormData()
    const attachmentContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files/dir1/test.pdf'))
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 10)
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/test.pdf'))
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    assert.equal(res.data.results[0].attr1, 10)
    let attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 1)
    assert.equal(attachments[0], res.data.results[0].attachmentPath)

    assert.equal((await fs.readdir('../data/test-tmp')).length, 0)

    await ax.delete('/api/v1/datasets/rest5/lines/' + line._id)
    await workers.hook('finalize/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 0)
    attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 0)
  })

  it('Send attachment with multipart and special _body key', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    const form = new FormData()
    const attachmentContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files/dir1/test.pdf'))
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('_body', '{"attr1":10}')
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].attr1, 10)
  })

  it('Send attachments with bulk request', async function () {
    const ax = ngernier4
    let res = await ax.post('/api/v1/datasets/rest6', {
      isRest: true,
      title: 'rest6',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    const form = new FormData()
    const attachmentsContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files.zip'))
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line1', attr1: 'test1', attachmentPath: 'test.odt' },
      { _id: 'line2', attr1: 'test1', attachmentPath: 'dir1/test.pdf' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form, { headers: formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest6')
    const ls = await lsAttachments(dataset)
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find((l: any) => l._id === 'line1')['_file.content'], 'This is a test libreoffice file.')

    const form1 = new FormData()
    const attachmentsContent1 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files2.zip'))
    form1.append('attachments', attachmentsContent1, 'files2.zip')
    form1.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form1, { headers: formHeaders(form1) })
    assert.equal(res.status, 200)
    await workers.hook('finalize/rest6')
    const ls1 = await lsAttachments(dataset)
    assert.equal(ls1.length, 2)
    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find((l: any) => l._id === 'line1')['_file.content'], 'This is another test libreoffice file.')

    const form2 = new FormData()
    const attachmentsContent2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files3.zip'))
    form2.append('attachments', attachmentsContent2, 'files3.zip')
    form2.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line3', attr1: 'test2', attachmentPath: 'files3/test2.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form2, { headers: formHeaders(form2) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalize/rest6')
    const ls2 = await lsAttachments(dataset)
    assert.equal(ls2.length, 3)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results.find((l: any) => l._id === 'line3')['_file.content'], 'This is another test libreoffice file.')

    const form3 = new FormData()
    const attachmentsContent3 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files2.zip'))
    form3.append('attachments', attachmentsContent3, 'files2.zip')
    form3.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line4', attr1: 'test3', attachmentPath: 'test.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form3, { headers: formHeaders(form3), params: { drop: true } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalize/rest6')
    const ls3 = await lsAttachments(dataset)
    assert.equal(ls3.length, 1)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results.find((l: any) => l._id === 'line4')['_file.content'], 'This is another test libreoffice file.')

    const form4 = new FormData()
    const attachmentsContent4 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files4.zip'))
    form4.append('attachments', attachmentsContent4, 'files4.zip')
    form4.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line5', attr1: 'test5', attachmentPath: 'testé.txt' },
      { _id: 'line6', attr1: 'test6', attachmentPath: 'test-missing.txt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form4, { headers: formHeaders(form4) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await workers.hook('finalize/rest6')
    const ls4 = await lsAttachments(dataset)
    assert.equal(ls4.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    const line5 = res.data.results.find((l: any) => l._id === 'line5')
    const line6 = res.data.results.find((l: any) => l._id === 'line6')
    assert.equal(line5['_file.content'], 'This a txt file with accented filename.')
    assert.ok(line5['_attachment_url'].endsWith('/testé.txt'))
    res = await ax.get(line5._attachment_url)
    assert.equal(res.data, 'This a txt file with accented filename.')
    assert.equal(res.headers['content-disposition'], 'inline; filename="teste.txt"; filename*=UTF-8\'\'test%C3%A9.txt')

    assert.ok(!line6['_file.content'])
    await assert.rejects(ax.get(line6._attachment_url), { status: 404 })
  })

  it('Synchronize all lines with the content of the attachments directory', async function () {
    const ax = ngernier4
    let res = await ax.post('/api/v1/datasets/restsync', {
      isRest: true,
      title: 'restsync',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ],
      primaryKey: ['attachmentPath']
    })
    let dataset = res.data

    const form = new FormData()
    const attachmentsContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files.zip'))
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')

    res = await ax.post('/api/v1/datasets/restsync/_bulk_lines', form, {
      headers: formHeaders(form),
      params: { lock: 'true' }
    })
    assert.equal(res.status, 200)
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restsync')
    const ls = await lsAttachments(dataset)
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 0)

    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 2)
    dataset = await workers.hook('finalize/restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 2)

    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })

    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbNotModified, 2)
    dataset = await workers.hook('finalize/restsync')

    await filesStorage.removeFile(path.join(attachmentsDir(dataset), 'test.odt'))
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbDeleted, 1)
    dataset = await workers.hook('finalize/restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 1)
  })

  it('Send bulk requests in ndjson file', async function () {
    const ax = ngernier4
    let res = await ax.post('/api/v1/datasets/restndjson', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' },
        { key: 'bytes', type: 'number' },
        { key: 'method', type: 'string' },
        { key: 'protocol', type: 'string' },
        { key: 'status', type: 'string' },
        { key: 'referer', type: 'string' },
        { key: 'url', type: 'string', 'x-refersTo': 'https://schema.org/WebPage' },
        { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
        { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' },
        { key: 'browser', type: 'string' },
        { key: 'device', type: 'string' },
        { key: 'os', type: 'string' },
        { key: 'collection', type: 'string' },
        { key: 'resourceId', type: 'string' },
        { key: 'operation', type: 'string' }
      ]
    })

    const form = new FormData()
    form.append('actions', await fs.readFile(path.resolve(import.meta.dirname, '../test/resources/rest/access.log.ndjson')), 'actions.ndjson')
    res = await ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 20)

    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restndjson')
    res = await ax.get('/api/v1/datasets/restndjson/lines')
    assert.equal(res.data.total, 20)
  })

  it('Send bulk requests in ndjson file and receive errors', async function () {
    const ax = ngernier4
    await ax.post('/api/v1/datasets/restndjson', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' }
      ]
    })

    const form = new FormData()
    form.append('actions', await fs.readFile(path.resolve(import.meta.dirname, '../test/resources/rest/access.log.ndjson')), 'actions.ndjson')
    await assert.rejects(ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: formHeaders(form) }), (err: any) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 20)
      assert.equal(err.data.nbOk, 0)
      return true
    })
    assert.equal((await fs.readdir('../data/test-tmp')).length, 0)
  })

  it('The size of the mongodb collection is part of storage consumption', async function () {
    const ax = dmeadus
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
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest7')

    let res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    const storageSize = res.data.limits.store_bytes.consumption
    assert.ok(storageSize > 350)
    res = await ax.get('/api/v1/datasets/rest7')
    assert.equal(res.data.storage.size, storageSize)
    assert.equal(res.data.storage.indexed.size, storageSize)
    assert.equal(res.data.storage.collection.size, storageSize)
  })

  it('Use the history mode', async function () {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthist', {
      isRest: true,
      title: 'resthist',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/resthist/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthist')
    res = await ax.patch('/api/v1/datasets/resthist/lines/id1', { attr1: 'test2' })
    await workers.hook('finalize/resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions', { params: { size: 1 } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.next)
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.next)
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test1')
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 0)
    assert.ok(!res.data.next)

    res = await ax.get('/api/v1/stats')
    const storageSize = res.data.limits.store_bytes.consumption
    console.log(res.data.limits.store_bytes)
    assert.ok(storageSize > 280)
    res = await ax.get('/api/v1/datasets/resthist')
    assert.equal(res.data.storage.size, storageSize)
    assert.ok(res.data.storage.collection.size > 80)
    assert.ok(res.data.storage.revisions.size > 160)
    assert.equal(res.data.storage.revisions.size + res.data.storage.collection.size, storageSize)

    res = await ax.delete('/api/v1/datasets/resthist/lines/id1')
    await workers.hook('finalize/resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'delete')
  })

  it('Store history with at least primary key info', async function () {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistprimary', {
      isRest: true,
      title: 'resthistprimary',
      rest: { history: true },
      primaryKey: ['attr1', 'attr2'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const line = (await ax.post('/api/v1/datasets/resthistprimary/lines', { attr1: 'test1', attr2: 'test2' })).data
    assert.ok(line._id)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthistprimary')

    res = await ax.delete('/api/v1/datasets/resthistprimary/lines/' + line._id)
    await workers.hook('finalize/resthistprimary')
    res = await ax.get('/api/v1/datasets/resthistprimary/revisions')
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0]._action, 'delete')
    assert.equal(res.data.results[0]._id, line._id)
    assert.equal(res.data.results[0].attr1, 'test1')
    assert.equal(res.data.results[0].attr2, 'test2')
  })

  it('Force _updatedAt value to fill existing history', async function () {
    const ax = dmeadus
    const axAdmin = superadmin
    await ax.post('/api/v1/datasets/resthistfill', {
      isRest: true,
      title: 'resthistfill',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }]
    })
    await assert.rejects(
      ax.post('/api/v1/datasets/resthistfill/lines', { _id: 'id1', attr1: 'test-old', _updatedAt: moment().subtract(1, 'day').toISOString() }),
      (err: any) => err.status === 400)
    const older = moment().subtract(2, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-older', _updatedAt: older })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthistfill')
    const old = moment().subtract(1, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-old', _updatedAt: old })
    await workers.hook('finalize/resthistfill')
    const lines = (await ax.get('/api/v1/datasets/resthistfill/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0]._updatedAt, old)

    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-now' })
    await workers.hook('finalize/resthistfill')
    const newLines = (await ax.get('/api/v1/datasets/resthistfill/lines')).data.results
    assert.equal(newLines.length, 1)
    assert.ok(newLines[0]._updatedAt > old)

    const history = (await ax.get('/api/v1/datasets/resthistfill/lines/id1/revisions')).data.results
    assert.equal(history[2].attr1, 'test-older')
    assert.equal(history[2]._updatedAt, older)
    assert.equal(history[1].attr1, 'test-old')
    assert.equal(history[1]._updatedAt, old)
    assert.equal(history[0].attr1, 'test-now')
  })

  it('Define a TTL on revisions in history', async function () {
    const ax = hlalonde3

    let res = await ax.post('/api/v1/datasets/resthistttl', {
      isRest: true,
      title: 'resthistttl',
      rest: { history: true, historyTTL: { active: true, delay: { value: 2, unit: 'days' } } },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const dataset = res.data
    res = await ax.post('/api/v1/datasets/resthistttl/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthistttl')
    res = await ax.patch('/api/v1/datasets/resthistttl/lines/id1', { attr1: 'test2' })
    await workers.hook('finalize/resthistttl')
    res = await ax.get('/api/v1/datasets/resthistttl/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    const revisionsCollection = restDatasetsUtils.revisionsCollection(dataset)
    let indexes = await revisionsCollection.listIndexes().toArray()
    assert.equal(indexes.length, 3)
    const index = indexes.find((i: any) => i.name === 'history-ttl')
    assert.ok(index)
    assert.equal(index.expireAfterSeconds, 2 * 24 * 60 * 60)

    dataset.rest.historyTTL = { active: false }
    res = await ax.patch('/api/v1/datasets/resthistttl', { rest: dataset.rest })
    await workers.hook('finalize/resthistttl')
    indexes = await revisionsCollection.listIndexes().toArray()
    assert.equal(indexes.length, 2)
    assert.ok(!indexes.find((i: any) => i.name === 'history-ttl'))
  })

  it('Toggle the history mode', async function () {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthisttoggle', {
      isRest: true,
      title: 'resthisttoggle',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/resthisttoggle/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: true } })
    await workers.hook('finalize/resthisttoggle')
    res = await ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } })
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions.count, 1)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: false } })
    await workers.hook('finalize/resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)
  })

  it('Use history mode with attachments', async function () {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistattach', {
      isRest: true,
      title: 'resthistattach',
      rest: { history: true },
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    const form = new FormData()
    const attachmentContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files/dir1/test.pdf'))
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 'test1')
    form.append('attr2', 'test1')
    res = await ax.post('/api/v1/datasets/resthistattach/lines', form, { headers: formHeaders(form) })
    const line = res.data
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthistattach')

    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, { attr1: 'test2' })
    await workers.hook('finalize/resthistattach')

    const form2 = new FormData()
    const attachmentContent2 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files/test.odt'))
    form2.append('attachment', attachmentContent2, 'dir1/test.pdf')
    form2.append('attr2', 'test2')
    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, form2, { headers: formHeaders(form2) })
    await workers.hook('finalize/resthistattach')

    res = await ax.get(`/api/v1/datasets/resthistattach/lines/${line._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[0].attr2, 'test2')
    assert.equal(res.data.results[1].attr1, 'test2')
    assert.equal(res.data.results[1].attr2, 'test1')
    assert.equal(res.data.results[2].attr1, 'test1')
    assert.equal(res.data.results[2].attr2, 'test1')
    assert.equal(res.data.results[2].attachmentPath, res.data.results[1].attachmentPath)
    assert.notEqual(res.data.results[1].attachmentPath, res.data.results[0].attachmentPath)
    let attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 2)

    await ax.delete(`/api/v1/datasets/resthistattach/lines/${line._id}`)
    await workers.hook('finalize/resthistattach')

    res = await ax.get(`/api/v1/datasets/resthistattach/lines/${line._id}/revisions`)
    assert.equal(res.data.results.length, 4)
    attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 2)
  })

  it('Apply a TTL on some date-field', async function () {
    const ax = hlalonde3
    await ax.post('/api/v1/datasets/restttl', {
      isRest: true,
      title: 'restttl',
      rest: {
        ttl: {
          active: true,
          prop: 'attr2',
          delay: {
            value: 1,
            unit: 'days'
          }
        }
      },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string', format: 'date-time' }]
    })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(3, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(2, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'hours').toISOString() })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('manageTTL/restttl')
    await workers.hook('finalize/restttl')
    const res = await ax.get('/api/v1/datasets/restttl/lines')
    assert.equal(res.data.total, 1)
  })

  it('Applying the exact same data twice does not trigger indexing', async function () {
    const ax = dmeadus
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
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('finalize/restidem')
    res = await ax.get('/api/v1/datasets/restidem/lines')
    assert.equal(res.data.total, 4)

    const collection = restDatasetsUtils.collection(dataset as any)
    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' }
    ])
    await workers.hook('finalize/restidem')
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _action: 'delete', _id: 'line2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    await workers.hook('finalize/restidem')

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'patch', _id: 'line4', attr1: 'test1' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    dataset = await workers.hook('finalize/restidem')
    assert.equal(dataset.count, 3)
  })

  it('Applying the exact same data twice in history mode should not duplicate revisions', async function () {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistidem', {
      isRest: true,
      title: 'resthistidem',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const dataset = res.data
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    const collection = restDatasetsUtils.collection(dataset)
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    await workers.hook('finalize/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)
    await workers.hook('finalize/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)
  })

  it('Delete all lines from a rest dataset', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restdel', {
      isRest: true,
      title: 'restdel',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restdel/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restdel')
    assert.equal(dataset.count, 4)

    await ax.delete('/api/v1/datasets/restdel/lines')
    dataset = await workers.hook('finalize/restdel')
    assert.equal(dataset.count, 0)
    const collection = restDatasetsUtils.collection(dataset)
    assert.equal(await collection.countDocuments({}), 0)
  })

  it('Send bulk actions as a CSV body', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' },
        { key: 'attr3', type: 'boolean' },
        { key: 'attr4', type: 'string', format: 'date-time' }
      ]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1,attr2,attr3,attr4
line1,test1,test1,oui,2015-03-18T00:58:59Z
line2,test1,test1,non,
line3,test1,test1,true,`, { headers: { 'content-type': 'text/csv' } })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[0].attr3, true)
    assert.equal(lines[0].attr4, '2015-03-18T00:58:59Z')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
    assert.equal(lines[1].attr2, 'test1')
    assert.equal(lines[1].attr3, false)
    assert.equal(lines[2].attr3, true)

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_action,_id,attr1,attr2
patch,line1,test2
update,line2,test2,test2`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 3)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line3')
    assert.equal(lines[1]._id, 'line1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test1')
    assert.equal(lines[2]._id, 'line2')
    assert.equal(lines[2].attr1, 'test2')
    assert.equal(lines[2].attr2, 'test2')

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id;attr1;attr2;attr3;attr4
line3;test1;test1;oui;2015-03-18T00:58:59
line4;test1;test1;oui,2015-03-18T00:58:59`, { headers: { 'content-type': 'text/csv' }, params: { sep: ';' } })
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 4)

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_action,_id,attr1,attr2
patch,line1,33`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 4)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '-_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, '33')
  })

  it('Send bulk actions as a CSV body with automatic adjustment of keys', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' }
      ]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `Attr1,Attr2
test1,test1
test2,test2`, { headers: { 'content-type': 'text/csv' } })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test2')
  })

  it('Resend downloaded csv as bulk actions', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' }
      ]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `attr1,attr2
test1,test1
test2,test2
test3,test3`, { headers: { 'content-type': 'text/csv' } })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 3)

    const csvLines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { format: 'csv' } })).data

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', csvLines, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalize/restcsv')
    assert.equal(dataset.count, 6)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 6)
  })

  it('Validate bulk actions sent as csv', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'boolean' }]
    })
    await assert.rejects(ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attrko
    line1,test1
    line2,test1
    line3,test1`, { headers: { 'content-type': 'text/csv' } }), (err: any) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 1)
      assert.equal(err.data.nbOk, 0)
      return true
    })
  })

  it('Accept date detected as ISO by JS but not by elasticsearch', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restdate', {
      isRest: true,
      title: 'restdate',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    await ax.post('/api/v1/datasets/restdate/lines', { attr1: '1961-02-13 00:00:00+00:00' })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restdate')
    let lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: '1961-02-14 00:00:00+00:00' })
    await workers.hook('finalize/restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-14T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: null })
    await workers.hook('finalize/restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.ok(!lines[0].attr1)
  })

  it('Accept date detected as ISO by JS but not by elasticsearch in bulk', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restdatebulk', {
      isRest: true,
      title: 'restdatebulk',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [
      { _id: '1', attr1: '1961-02-13 00:00:00+00:00', attr2: 'val1' },
      { _id: '2', attr1: '1961-02-13T00:00:00+00:00', attr2: 'val2' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restdatebulk')
    let lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[0].attr2, 'val2')
    assert.equal(lines[1].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[1].attr2, 'val1')

    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [{ _id: lines[0]._id, attr1: null, _action: 'patch' }])
    await workers.hook('finalize/restdatebulk')
    lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.ok(!lines[0].attr1)
    assert.equal(lines[0].attr2, 'val2')
  })

  it('Accept date detected as ISO by JS but not by elasticsearch in bulk CSV', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    const res = await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1
    line1,1961-02-13 00:00:00+00:00`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 1)
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restcsv')
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
  })

  it('Ignore null values', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restnull', {
      isRest: true,
      title: 'restnull',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restnull/lines', { attr1: 'val1', attr2: null })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restnull')
    const lines = (await ax.get('/api/v1/datasets/restnull/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, 'val1')
    assert.ok(!('attr2' in lines[0]))
  })

  it('Send bulk actions as a gzipped CSV', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restgzcsv', {
      isRest: true,
      title: 'restgzcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restgzcsv/_bulk_lines', zlib.gzipSync(`_id,attr1,attr2
line1,test1,test1
line2,test1,test1`), { headers: { 'content-type': 'text/csv+gzip' } })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restgzcsv')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restgzcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .csv file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', `_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`, 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsvfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .csv file with other encoding', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'testé2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', iconv.encode(`_id,attr1,testé2
    line1,test1,testé1
    line2,test1,testé1`, 'ISO-8859-1'), 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsvfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].testé2, 'testé1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
    assert.equal(lines[1].testé2, 'testé1')
  })

  it('Send bulk as a .csv.gz file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvgz', {
      isRest: true,
      title: 'restcsvgz',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', zlib.gzipSync(`_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`), 'actions.csv.gz')
    await ax.post('/api/v1/datasets/restcsvgz/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsvgz')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvgz/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .xlsx file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restxlsxfile', {
      isRest: true,
      title: 'restxlsxfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/actions.xlsx')), 'actions.xlsx')
    await ax.post('/api/v1/datasets/restxlsxfile/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restxlsxfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restxlsxfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  it('Send bulk as a .ods file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restodsfile', {
      isRest: true,
      title: 'restodsfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/actions.xlsx')), 'actions.ods')
    await ax.post('/api/v1/datasets/restodsfile/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restodsfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restodsfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  it('Send bulk as a .zip file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvzip', {
      isRest: true,
      title: 'restcsvzip',
      schema: [{ key: 'id', type: 'string' }, { key: 'adr', type: 'string' }, { key: 'some date', type: 'string' }, { key: 'loc', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    const actionsContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/dataset1.zip'))
    form.append('actions', actionsContent, 'dataset1.zip')
    await ax.post('/api/v1/datasets/restcsvzip/_bulk_lines', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restcsvzip')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvzip/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].id, 'koumoul')
    assert.equal(lines[1].id, 'bidule')
  })

  it('Use the primary key defined by the user', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/restkey', {
      isRest: true,
      title: 'restkey',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }],
      primaryKey: ['attr1', 'attr2']
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', `attr1,attr2,attr3
test1,test1,test1
test2,test2,test2
test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restkey')
    assert.equal(dataset.count, 2)
    let lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr3, 'test3')

    await assert.rejects(ax.post('/api/v1/datasets/restkey/lines', { _id: lines[0]._id, attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err: any) => err.status === 400)
    await assert.rejects(ax.put('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err: any) => err.status === 400)
    await assert.rejects(ax.patch('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2' }), (err: any) => err.status === 400)

    await ax.post('/api/v1/datasets/restkey/_bulk_lines', [
      { _action: 'delete', attr1: 'test1', attr2: 'test1' }
    ])
    dataset = await workers.hook('finalize/restkey')
    assert.equal(dataset.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test2')
    assert.equal(lines[0].attr3, 'test3')

    res = await ax.post('/api/v1/datasets/restkey/_bulk_lines', `_action,attr1,attr2,attr3
patch,test2,test2,test2
patch,test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalize/restkey')
    assert.equal(dataset.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr3, 'test3')
  })

  it('Perform CRUD operations in larger bulk and keep request alive', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'restlarge',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    const bulkLines = []
    for (let i = 0; i < 550; i++) {
      bulkLines.push({ attr1: 'test' + i })
    }
    const res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', bulkLines, { responseType: 'stream' })
    let i = 0
    await Promise.all([
      pump(res.data, new Writable({
        write (chunk, encoding, callback) {
          i += 1
          if (i < 3) assert.equal(chunk.toString(), ' ')
          else if (chunk.toString() !== ' ') {
            const result = JSON.parse(chunk.toString())
            assert.equal(result.nbOk, 550)
          }
          callback()
        }
      })),
      (async () => {
        const workers = await import('../api/src/workers/index.ts')
        await workers.hook('finalize/rest2')
      })()
    ])
    assert.equal(i, 6)
  })

  it('Removing a property triggers mongo unset and reindexing', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/restunset', {
      isRest: true,
      title: 'restunset',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data
    res = await ax.post('/api/v1/datasets/restunset/lines', { attr1: 'test1', attr2: 'test1' })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restunset')
    const storage1 = dataset.storage.size

    res = await ax.patch('/api/v1/datasets/restunset', { schema: [{ key: 'attr1', type: 'string', readOnly: true }] })

    await workers.hook('indexLines/restunset')
    dataset = await workers.hook('finalize/restunset')
    const storage2 = dataset.storage.size
    assert.ok(storage2 < storage1)

    res = await ax.get('/api/v1/datasets/restunset/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0].attr2)
  })

  it('Activating/deactivating storeUpdatedBy', async function () {
    const ax = dmeadusOrg
    let res = await ax.post('/api/v1/datasets/updatedby', {
      isRest: true,
      title: 'updatedby',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test1' })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/updatedby')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true } })

    await workers.hook('indexLines/updatedby')
    await workers.hook('finalize/updatedby')

    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0]._updatedBy)
    const lineId = res.data.results[0]._id

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await workers.hook('finalize/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.equal(res.data.results[0]._updatedBy, 'dmeadus0')
    assert.equal(res.data.results[0]._updatedByName, 'Danna Meadus')

    res = await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { apiKeys: [{ title: 'api key', scopes: ['datasets'] }] })
    const apiKey = res.data.apiKeys[0]
    const { getAxios } = await import('./utils/index.ts')
    const axAPIKey = getAxios({ headers: { 'x-apiKey': apiKey.clearKey } })
    await axAPIKey.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test3' })
    await workers.hook('finalize/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.equal(res.data.results[0]._updatedBy, 'apiKey:' + apiKey.id)
    assert.equal(res.data.results[0]._updatedByName, 'api key')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true, history: true } })
    await workers.hook('finalize/updatedby')

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await workers.hook('finalize/updatedby')
    res = await ax.get(`/api/v1/datasets/updatedby/lines/${lineId}/revisions`)
    assert.equal(res.data.results[0]._updatedBy, 'dmeadus0')
    assert.equal(res.data.results[0]._updatedByName, 'Danna Meadus')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: false, history: true } })
    await workers.hook('finalize/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(!res.data.results[0]._updatedBy)
    assert.ok(!res.data.results[0]._updatedByName)
  })

  it('Use drop option to recreate all data', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/restdrop', {
      isRest: true,
      title: 'restdrop',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    let dataset = res.data

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test1-1' },
      { attr1: 'test1-2' }
    ])
    assert.equal(res.data.nbCreated, 2)
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restdrop')
    assert.equal(dataset.count, 2)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test2-1' },
      { attr1: 'test2-2' }
    ])
    assert.equal(res.data.nbCreated, 2)
    dataset = await workers.hook('finalize/restdrop')
    assert.equal(dataset.count, 4)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test3-1' },
      { attr1: 'test3-2' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 2)
    assert.equal(res.data.dropped, true)
    dataset = await workers.hook('finalize/restdrop')
    assert.equal(dataset.count, 2)

    res = await ax.get('/api/v1/datasets/restdrop/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].attr1, 'test3-2')
    assert.equal(res.data.results[1].attr1, 'test3-1')

    await assert.rejects(ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attrko: 'ko' }
    ], { params: { drop: true } }), (err: any) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 1)
      assert.equal(err.data.cancelled, true)
      return true
    })

    res = await ax.get('/api/v1/datasets/restdrop')
    assert.equal(res.data.status, 'finalized')
    res = await ax.get('/api/v1/datasets/restdrop/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].attr1, 'test3-2')
    assert.equal(res.data.results[1].attr1, 'test3-1')
  })

  it('Use drop option to recreate all data and manage history', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/restdrophist', {
      isRest: true,
      title: 'restdrophist',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }],
      rest: { history: true }
    })
    let dataset = res.data

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v1' },
      { attr1: 'test2', attr2: 'v1' },
      { attr1: 'test3', attr2: 'v1' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/restdrophist')

    const lines = (await ax.get('/api/v1/datasets/restdrophist/lines')).data.results
    const line2 = lines.find((l: any) => l.attr1 === 'test2')
    const line3 = lines.find((l: any) => l.attr1 === 'test3')
    await ax.delete('/api/v1/datasets/restdrophist/lines/' + line3._id)
    dataset = await workers.hook('finalize/restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v2' },
      { attr1: 'test2', attr2: 'v2' }
    ])
    dataset = await workers.hook('finalize/restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v3' },
      { attr1: 'test3', attr2: 'v2' },
      { attr1: 'test4', attr2: 'v1' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 3)
    assert.equal(res.data.dropped, true)
    dataset = await workers.hook('finalize/restdrophist')
    assert.equal(dataset.count, 3)

    res = await ax.get(`/api/v1/datasets/restdrophist/lines/${line3._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'createOrUpdate')
    assert.equal(res.data.results[0].attr2, 'v2')
    assert.equal(res.data.results[1]._action, 'delete')
    assert.equal(res.data.results[2]._action, 'createOrUpdate')
    assert.equal(res.data.results[2].attr2, 'v1')

    res = await ax.get(`/api/v1/datasets/restdrophist/lines/${line2._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'delete')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._action, 'createOrUpdate')
    assert.equal(res.data.results[1].attr2, 'v2')
    assert.equal(res.data.results[2]._action, 'createOrUpdate')
    assert.equal(res.data.results[2].attr2, 'v1')
  })

  it('Specify a date-time format', async function () {
    const ax = hlalonde3
    await ax.post('/api/v1/datasets/restdatetimeformat', {
      isRest: true,
      title: 'restdatetimeformat',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string', format: 'date-time', dateTimeFormat: 'D/M/YYYY H:m' }]
    })
    let res = await ax.post('/api/v1/datasets/restdatetimeformat/_bulk_lines', [
      { attr1: 'test1', attr2: moment().toISOString() },
      { attr1: 'test2', attr2: moment().format('D/M/YYYY H:m') },
      { attr1: 'test3', attr2: 'bad date' }
    ])
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.nbOk, 2)
    res = await ax.post('/api/v1/datasets/restdatetimeformat/_bulk_lines', `attr1,attr2
    test1,${moment().toISOString()}
    test2,${moment().format('D/M/YYYY H:m')}
    test2,bad date`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.nbOk, 2)

    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restdatetimeformat')
    res = await ax.get('/api/v1/datasets/restdatetimeformat/lines')
    assert.equal(res.data.total, 4)
  })

  it('Send geometries in a column', async function () {
    const ax = hlalonde3
    await ax.post('/api/v1/datasets/restgeo', {
      isRest: true,
      title: 'restgeo',
      projection: {
        title: 'RGF93 / Lambert-93 -- France',
        code: 'EPSG:2154'
      },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'geom', type: 'string', 'x-refersTo': 'http://data.ign.fr/def/geometrie#Geometry' }]
    })
    let res = await ax.post('/api/v1/datasets/restgeo/_bulk_lines', [
      { attr1: 'test1', geom: '{ "type": "LineString", "coordinates": [ [325393.494869902, 6811835.01781834], [325395.994869902, 6811844.39281834], [325419.119869902, 6811855.64281834], [325459.744869902, 6811870.33031834], [325481.932369902, 6811879.39281834], [325486.307369902, 6811880.64281834] ] }' },
      { attr1: 'test2', geom: '{ "type": "GeometryCollection", "geometries": [ { "type": "LineString", "coordinates": [ [251886.985899411, 6872275.12076354], [251888.207983521, 6872292.65793929] ] } ] }' }
    ])
    assert.equal(res.data.nbOk, 2)

    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/restgeo')
    res = await ax.get('/api/v1/datasets/restgeo/lines?select=attr1,geom,_geopoint,_geocorners')
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geocorners)
    assert.ok(res.data.results[1]._geopoint)
    assert.ok(res.data.results[1]._geocorners)
  })

  it('Send attachment with special chars', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest attachment ko',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    const form = new FormData()
    const attachmentContent = fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/datasets/files/dir1/test.pdf'))
    form.append('attachment', attachmentContent, 'Capture d\'écran du 2024-11-19 10-20-57.png')
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/Capture d\'écran du 2024-11-19 10-20-57.png'))
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.ok(
      res.headers['content-disposition'].includes('Capture') &&
      res.headers['content-disposition'].includes('2024-11-19') &&
      res.headers['content-disposition'].includes('filename*=UTF-8\'\'Capture%20d')
    )
  })
})
