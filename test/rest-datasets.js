import { strict as assert } from 'node:assert'

import * as testUtils from './resources/test-utils.js'
import path from 'node:path'
import fs from 'fs-extra'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.js'
import moment from 'moment'
import zlib from 'zlib'
import { Writable } from 'stream'
import iconv from 'iconv-lite'
import { promisify } from 'util'
import * as restDatasetsUtils from '../api/src/datasets/utils/rest.ts'
import { attachmentsDir, lsAttachments } from '../api/src/datasets/utils/files.ts'
import pumpOg from 'pump'

const pump = promisify(pumpOg)

describe('REST datasets', function () {
  it('Create empty REST datasets', async function () {
    const ax = global.ax.dmeadus

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
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalizer/rest1')
    assert.equal(res.status, 201)
    assert.ok(res.data._id)
    assert.equal(res.data.attr1, 'test1')
    res = await ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalizer/rest1')
    assert.equal(res.data._id, 'id1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test1')
    await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
    await workers.hook('finalizer/rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test2')
    await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
    await workers.hook('finalizer/rest1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test3')
    assert.equal(res.data.attr2, 'test2')
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'create' }), err => err.status === 409)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'create' }), err => err.status === 409)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { _i: 10 }), err => err.status === 400)

    await ax.delete('/api/v1/datasets/rest1/lines/id1')
    await workers.hook('finalizer/rest1')
    await assert.rejects(ax.get('/api/v1/datasets/rest1/lines/id1'), err => err.status === 404)
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4' }), err => err.status === 404)
    await assert.rejects(ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test4', _action: 'update' }), err => err.status === 404)
    await assert.rejects(ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test4', _action: 'update' }), err => err.status === 404)
  })

  it('Reject properly json missing content-type', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restjson', {
      isRest: true,
      title: 'restjson',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    await assert.rejects(ax.post('/api/v1/datasets/restjson/lines', JSON.stringify({ attr1: 'test1', attr2: 'test1' })), (err) => {
      assert.equal(err.status, 415)
      assert.equal(err.data, 'Cette API attend un header content-type compatible, le plus souvent application/json.')
      return true
    })
  })

  it('Perform CRUD operations in bulks', async function () {
    const ax = global.ax.dmeadus
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
      { _action: 'delete', _id: 'line2' },
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'update', _id: 'line4', attr1: 'test2', attr2: 'test2' }
    ])
    await workers.hook('finalizer/rest2')
    assert.equal(res.data.nbOk, 7)
    assert.equal(res.data.nbCreated, 4)
    assert.equal(res.data.nbDeleted, 1)
    assert.ok(res.data.indexedAt)

    try {
      await ax.get('/api/v1/datasets/rest2/lines/line2')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
    }
    res = await ax.get('/api/v1/datasets/rest2/lines/line3')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test1')
    res = await ax.get('/api/v1/datasets/rest2/lines/line4')
    assert.equal(res.data.attr1, 'test2')
    assert.equal(res.data.attr2, 'test2')
  })

  it('Index and finalize dataset after write', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
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
    let dataset = await workers.hook('finalizer/rest3')
    assert.ok(dataset.schema.find(f => f.key === '_id'))
    assert.ok(dataset.schema.find(f => f.key === '_updatedAt'))
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

    // Patch one through db query to check that it won't processed
    // we must be sure that the whole dataset is not reindexed each time, only the diffs
    const collection = restDatasetsUtils.collection(dataset)
    await collection.updateOne({ _id: 'line4' }, { $set: { attr2: 'altered' } })
    assert.equal((await collection.findOne({ _id: 'line4' })).attr2, 'altered')

    res = await ax.post('/api/v1/datasets/rest3/_bulk_lines?async=true', [
      { _action: 'delete', _id: 'line1' },
      { _action: 'patch', _id: 'line2', attr1: 'test2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 2)

    dataset = await workers.hook('finalizer/rest3')
    console.log(dataset.updatedAt, dataset.createdAt)
    assert.equal(dataset.updatedAt, dataset.createdAt)
    assert.ok(dataset.dataUpdatedAt > dataset.updatedAt)
    assert.ok(dataset.finalizedAt > dataset.dataUpdatedAt)
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)
    assert.equal(dataset.count, 3)
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 3)
    const line4 = res.data.results.find(r => r._id === 'line4')
    assert.equal(line4.attr2, 'test1')
  })

  it('Reindex after an error', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
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
    let dataset = await workers.hook('finalizer/trigger-test-error')
    await global.ax.superadmin.post('/api/v1/datasets/trigger-test-error/_reindex')
    await assert.rejects(workers.hook('finalizer/trigger-test-error'))
    dataset = await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    assert.equal(dataset.status, 'error')
    let journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'error')
    await ax.patch('/api/v1/datasets/trigger-test-error', { slug: 'test-no-trigger' })
    await ax.get('/api/v1/datasets/trigger-test-error').then(r => r.data)
    dataset = await workers.hook('finalizer/trigger-test-error')
    assert.equal(dataset.status, 'finalized')
    journal = await ax.get('/api/v1/datasets/trigger-test-error/journal').then(r => r.data)
    assert.equal(journal[0].type, 'finalize-end')
  })

  it('Use dataset schema to validate inputs', async function () {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest4', {
      isRest: true,
      title: 'rest4',
      schema: [{ key: 'attr1', type: 'string', 'x-required': true }, { key: 'attr2', type: 'string', pattern: '^test[0-9]$' }, { key: 'attr3', type: 'string', pattern: '^test[0-9]$', separator: ', ' }]
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attrko: 'test1' }), (err) => {
      assert.equal(err.data, 'ne doit pas contenir de propriétés additionnelles (attrko)')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', _attrko: 'test1' }), (err) => {
      assert.equal(err.data, 'ne doit pas contenir de propriétés additionnelles (_attrko)')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 111 }), (err) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 'test', attr2: 'test1' })

    await assert.rejects(ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 111 }), (err) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.patch('/api/v1/datasets/rest4/lines/line1', { attr1: 111 }), (err) => {
      assert.equal(err.data, '/attr1 doit être de type string')
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.patch('/api/v1/datasets/rest4/lines/line1', { attr2: 'testko' }), (err) => {
      assert.ok(err.data.startsWith('/attr2 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr2: 'test1' }), (err) => {
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
    line = await ax.post('/api/v1/datasets/rest4/lines', form, { headers: testUtils.formHeaders(form) }).then(r => r.data)
    assert.equal(line.attr3, 'test1, test2')

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: 'test1, testko' }), (err) => {
      assert.ok(err.data.startsWith('/attr3/1 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(ax.post('/api/v1/datasets/rest4/lines', { attr1: 'test', attr3: ['test1', 'testko'] }), (err) => {
      assert.ok(err.data.startsWith('/attr3/1 doit correspondre au format'))
      assert.equal(err.status, 400)
      return true
    })

    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', `attr1,attr2,attr3
test1,test1,test1
test1,test1,"test1, test2"
test1,test1,"test1, testko"`, { headers: { 'content-type': 'text/csv' } })

    assert.equal(res.data.nbOk, 2)
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.errors.length, 1)
    assert.equal(res.data.errors[0].line, 2)
    console.log(res.data.errors[0].error)
    assert.ok(res.data.errors[0].error.startsWith('/attr3/1 doit correspondre au format'))

    res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test1', attr3: 'test1, test2' },
      { attr1: 'test1', attr2: 'test1', attr3: ['test1', 'test2'] },
      { attr1: 'test1', attr2: 'test1', attr3: 'test1, testko' }
    ])

    assert.equal(res.data.nbOk, 3)
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.errors.length, 1)
    assert.equal(res.data.errors[0].line, 3)
    assert.ok(res.data.errors[0].error.startsWith('/attr3/1 doit correspondre au format'))

    await workers.hook('finalizer/rest4')
  })

  it('Use nonBlockingValidation option', async function () {
    const ax = global.ax.dmeadus
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

    await workers.hook('finalizer/rest4')
  })

  it('Send attachment with multipart request', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 10)
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/test.pdf'))
    await workers.hook('finalizer/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    assert.equal(res.data.results[0].attr1, 10)
    let attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 1)
    assert.equal(attachments[0], res.data.results[0].attachmentPath)

    assert.equal((await fs.readdir('../data/test/tmp')).length, 0)

    await ax.delete('/api/v1/datasets/rest5/lines/' + line._id)
    await workers.hook('finalizer/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 0)
    attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 0)
  })

  it('Send attachment with multipart and special _body key', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('_body', '{"attr1":10}')
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    await workers.hook('finalizer/rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].attr1, 10)
  })

  it('Send attachments with bulk request', async function () {
    const ax = await global.ax.ngernier4
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
    const attachmentsContent = fs.readFileSync('./resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line1', attr1: 'test1', attachmentPath: 'test.odt' },
      { _id: 'line2', attr1: 'test1', attachmentPath: 'dir1/test.pdf' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await workers.hook('finalizer/rest6')
    const ls = await lsAttachments(dataset)
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find(l => l._id === 'line1')['_file.content'], 'This is a test libreoffice file.')

    // overwrite 1 line
    const form1 = new FormData()
    const attachmentsContent1 = fs.readFileSync('./resources/datasets/files2.zip')
    form1.append('attachments', attachmentsContent1, 'files2.zip')
    form1.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form1, { headers: testUtils.formHeaders(form1) })
    assert.equal(res.status, 200)
    await workers.hook('finalizer/rest6')
    const ls1 = await lsAttachments(dataset)
    assert.equal(ls1.length, 2)
    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find(l => l._id === 'line1')['_file.content'], 'This is another test libreoffice file.')

    // add 1 more line
    const form2 = new FormData()
    const attachmentsContent2 = fs.readFileSync('./resources/datasets/files3.zip')
    form2.append('attachments', attachmentsContent2, 'files3.zip')
    form2.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line3', attr1: 'test2', attachmentPath: 'files3/test2.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form2, { headers: testUtils.formHeaders(form2) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalizer/rest6')
    const ls2 = await lsAttachments(dataset)
    assert.equal(ls2.length, 3)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results.find(l => l._id === 'line3')['_file.content'], 'This is another test libreoffice file.')

    // 1 more time but in "drop" mode
    const form3 = new FormData()
    const attachmentsContent3 = fs.readFileSync('./resources/datasets/files2.zip')
    form3.append('attachments', attachmentsContent3, 'files2.zip')
    form3.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line4', attr1: 'test3', attachmentPath: 'test.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form3, { headers: testUtils.formHeaders(form3), params: { drop: true } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalizer/rest6')
    const ls3 = await lsAttachments(dataset)
    assert.equal(ls3.length, 1)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results.find(l => l._id === 'line4')['_file.content'], 'This is another test libreoffice file.')

    // with an accented filename and a missing file
    const form4 = new FormData()
    const attachmentsContent4 = fs.readFileSync('./resources/datasets/files4.zip')
    form4.append('attachments', attachmentsContent4, 'files4.zip')
    form4.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line5', attr1: 'test5', attachmentPath: 'testé.txt' },
      { _id: 'line6', attr1: 'test6', attachmentPath: 'test-missing.txt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form4, { headers: testUtils.formHeaders(form4) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await workers.hook('finalizer/rest6')
    const ls4 = await lsAttachments(dataset)
    assert.equal(ls4.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    const line5 = res.data.results.find(l => l._id === 'line5')
    const line6 = res.data.results.find(l => l._id === 'line6')
    assert.equal(line5['_file.content'], 'This a txt file with accented filename.')
    res = await ax.get(line5._attachment_url)
    assert.equal(res.data, 'This a txt file with accented filename.')
    assert.ok(!line6['_file.content'])
    await assert.rejects(ax.get(line6._attachment_url), { status: 404 })
  })

  it('Synchronize all lines with the content of the attachments directory', async function () {
    const ax = await global.ax.ngernier4
    let res = await ax.post('/api/v1/datasets/restsync', {
      isRest: true,
      title: 'restsync',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ],
      primaryKey: ['attachmentPath']
    })
    let dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    const attachmentsContent = fs.readFileSync('./resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')

    res = await ax.post('/api/v1/datasets/restsync/_bulk_lines', form, {
      headers: testUtils.formHeaders(form),
      params: { lock: 'true' }
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook('finalizer/restsync')
    const ls = await lsAttachments(dataset)
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 0)

    // should create 2 lines for the 2 uploaded attachments
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 2)
    dataset = await workers.hook('finalizer/restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 2)

    // second sync should do noting
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })

    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbNotModified, 2)
    dataset = await workers.hook('finalizer/restsync')

    // remove a file a resync, we sould have 1 line
    await fs.remove(path.join(attachmentsDir(dataset), 'test.odt'))
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbDeleted, 1)
    dataset = await workers.hook('finalizer/restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 1)
  })

  it('Send bulk requests in ndjson file', async function () {
    const ax = await global.ax.ngernier4
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

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('resources/rest/access.log.ndjson'), 'actions.ndjson')
    res = await ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 20)

    await workers.hook('finalizer/restndjson')
    res = await ax.get('/api/v1/datasets/restndjson/lines')
    assert.equal(res.data.total, 20)
  })

  it('Send bulk requests in ndjson file and receive errors', async function () {
    const ax = await global.ax.ngernier4
    await ax.post('/api/v1/datasets/restndjson', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('resources/rest/access.log.ndjson'), 'actions.ndjson')
    await assert.rejects(ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: testUtils.formHeaders(form) }), (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 20)
      assert.equal(err.data.nbOk, 0)
      return true
    })
    assert.equal((await fs.readdir('../data/test/tmp')).length, 0)
  })

  it('The size of the mongodb collection is part of storage consumption', async function () {
    // Load a few lines
    const ax = await global.ax.builder('ccherryholme1@icio.us', 'passwd')
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
    await workers.hook('finalizer/rest7')

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
    const ax = await global.ax.hlalonde3
    let res = await ax.post('/api/v1/datasets/resthist', {
      isRest: true,
      title: 'resthist',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/resthist/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    await workers.hook('finalizer/resthist')
    res = await ax.patch('/api/v1/datasets/resthist/lines/id1', { attr1: 'test2' })
    await workers.hook('finalizer/resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    // paginate in history
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

    // revisions collection is part of storage consumption
    res = await ax.get('/api/v1/stats')
    const storageSize = res.data.limits.store_bytes.consumption
    console.log(res.data.limits.store_bytes)
    assert.ok(storageSize > 280)
    res = await ax.get('/api/v1/datasets/resthist')
    assert.equal(res.data.storage.size, storageSize)
    assert.ok(res.data.storage.collection.size > 80)
    assert.ok(res.data.storage.revisions.size > 160)
    assert.equal(res.data.storage.revisions.size + res.data.storage.collection.size, storageSize)

    // delete a line, its history should still be available
    res = await ax.delete('/api/v1/datasets/resthist/lines/id1')
    await workers.hook('finalizer/resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'delete')
  })

  it('Store history with at least primary key info', async function () {
    const ax = await global.ax.hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistprimary', {
      isRest: true,
      title: 'resthistprimary',
      rest: { history: true },
      primaryKey: ['attr1', 'attr2'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const line = (await ax.post('/api/v1/datasets/resthistprimary/lines', { attr1: 'test1', attr2: 'test2' })).data
    assert.ok(line._id)
    await workers.hook('finalizer/resthistprimary')

    // delete a line, its history should still be available and contain the primary key info
    res = await ax.delete('/api/v1/datasets/resthistprimary/lines/' + line._id)
    await workers.hook('finalizer/resthistprimary')
    res = await ax.get('/api/v1/datasets/resthistprimary/revisions')
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0]._action, 'delete')
    assert.equal(res.data.results[0]._id, line._id)
    assert.equal(res.data.results[0].attr1, 'test1')
    assert.equal(res.data.results[0].attr2, 'test2')
  })

  it('Force _updatedAt value to fill existing history', async function () {
    const ax = await global.ax.superadminPersonal
    const axAdmin = await global.ax.superadmin
    await ax.post('/api/v1/datasets/resthistfill', {
      isRest: true,
      title: 'resthistfill',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }]
    })
    // _updatedAt is normally rejected, accepted only as superadmin
    await assert.rejects(
      ax.post('/api/v1/datasets/resthistfill/lines', { _id: 'id1', attr1: 'test-old', _updatedAt: moment().subtract(1, 'day').toISOString() }),
      err => err.status === 400)
    const older = moment().subtract(2, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-older', _updatedAt: older })
    await workers.hook('finalizer/resthistfill')
    const old = moment().subtract(1, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-old', _updatedAt: old })
    await workers.hook('finalizer/resthistfill')
    const lines = (await ax.get('/api/v1/datasets/resthistfill/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0]._updatedAt, old)

    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-now' })
    await workers.hook('finalizer/resthistfill')
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
    const ax = await global.ax.hlalonde3

    let res = await ax.post('/api/v1/datasets/resthistttl', {
      isRest: true,
      title: 'resthistttl',
      rest: { history: true, historyTTL: { active: true, delay: { value: 2, unit: 'days' } } },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const dataset = res.data
    res = await ax.post('/api/v1/datasets/resthistttl/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    await workers.hook('finalizer/resthistttl')
    res = await ax.patch('/api/v1/datasets/resthistttl/lines/id1', { attr1: 'test2' })
    await workers.hook('finalizer/resthistttl')
    res = await ax.get('/api/v1/datasets/resthistttl/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    const revisionsCollection = restDatasetsUtils.revisionsCollection(dataset)
    let indexes = await revisionsCollection.listIndexes().toArray()
    assert.equal(indexes.length, 3)
    const index = indexes.find(i => i.name === 'history-ttl')
    assert.ok(index)
    assert.equal(index.expireAfterSeconds, 2 * 24 * 60 * 60)

    // disable TTL
    dataset.rest.historyTTL = { active: false }
    res = await ax.patch('/api/v1/datasets/resthistttl', { rest: dataset.rest })
    await workers.hook('finalizer/resthistttl')
    indexes = await revisionsCollection.listIndexes().toArray()
    assert.equal(indexes.length, 2)
    assert.ok(!indexes.find(i => i.name === 'history-ttl'))
  })

  it('Toggle the history mode', async function () {
    const ax = await global.ax.hlalonde3
    let res = await ax.post('/api/v1/datasets/resthisttoggle', {
      isRest: true,
      title: 'resthisttoggle',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/resthisttoggle/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalizer/resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: true } })
    await workers.hook('finalizer/resthisttoggle')
    res = await ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } })
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions.count, 1)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: false } })
    await workers.hook('finalizer/resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)
  })

  it('Use history mode with attachments', async function () {
    const ax = await global.ax.hlalonde3
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

    // create line with an attachment
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 'test1')
    form.append('attr2', 'test1')
    res = await ax.post('/api/v1/datasets/resthistattach/lines', form, { headers: testUtils.formHeaders(form) })
    const line = res.data
    await workers.hook('finalizer/resthistattach')

    // patch a property but do not touch the attachment
    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, { attr1: 'test2' })
    await workers.hook('finalizer/resthistattach')

    // patch the attachment
    const form2 = new FormData()
    const attachmentContent2 = fs.readFileSync('./resources/datasets/files/test.odt')
    form2.append('attachment', attachmentContent2, 'dir1/test.pdf')
    form2.append('attr2', 'test2')
    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, form2, { headers: testUtils.formHeaders(form2) })
    await workers.hook('finalizer/resthistattach')

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

    // delete the line, the attachments should still be there
    await ax.delete(`/api/v1/datasets/resthistattach/lines/${line._id}`)
    await workers.hook('finalizer/resthistattach')

    res = await ax.get(`/api/v1/datasets/resthistattach/lines/${line._id}/revisions`)
    assert.equal(res.data.results.length, 4)
    attachments = await lsAttachments(dataset)
    assert.equal(attachments.length, 2)
  })

  it('Apply a TTL on some date-field', async function () {
    const ax = await global.ax.hlalonde3
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
    await workers.hook('ttlManager/restttl')
    await workers.hook('finalizer/restttl')
    const res = await ax.get('/api/v1/datasets/restttl/lines')
    assert.equal(res.data.total, 1)
  })

  it('Applying the exact same data twice does not trigger indexing', async function () {
    // Load a few lines
    const ax = global.ax.dmeadus
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
    let dataset = await workers.hook('finalizer/restidem')
    res = await ax.get('/api/v1/datasets/restidem/lines')
    assert.equal(res.data.total, 4)

    const collection = restDatasetsUtils.collection(dataset)
    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' }
    ])
    await workers.hook('finalizer/restidem')
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _action: 'delete', _id: 'line2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    await workers.hook('finalizer/restidem')

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'patch', _id: 'line4', attr1: 'test1' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    dataset = await workers.hook('finalizer/restidem')
    assert.equal(dataset.count, 3)
  })

  it('Applying the exact same data twice in history mode should not duplicate revisions', async function () {
    const ax = await global.ax.hlalonde3
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
    await workers.hook('finalizer/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    // 1 in 2 lines is changed
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    const collection = restDatasetsUtils.collection(dataset)
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    await workers.hook('finalizer/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    // no line is actually changed
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)
    await workers.hook('finalizer/resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)
  })

  it('Delete all lines from a rest dataset', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restdel')
    assert.equal(dataset.count, 4)

    await ax.delete('/api/v1/datasets/restdel/lines')
    dataset = await workers.hook('finalizer/restdel')
    assert.equal(dataset.count, 0)
    const collection = restDatasetsUtils.collection(dataset)
    assert.equal(await collection.countDocuments({}), 0)
  })

  it('Send bulk actions as a CSV body', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restcsv')
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
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 3)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line3')
    assert.equal(lines[1]._id, 'line1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test1')
    assert.equal(lines[2]._id, 'line2')
    assert.equal(lines[2].attr1, 'test2')
    assert.equal(lines[2].attr2, 'test2')

    // custom separator
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id;attr1;attr2;attr3;attr4
line3;test1;test1;oui;2015-03-18T00:58:59
line4;test1;test1;oui,2015-03-18T00:58:59`, { headers: { 'content-type': 'text/csv' }, params: { sep: ';' } })
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 4)
  })

  it('Send bulk actions as a CSV body with automatic adjustment of keys', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'test2')
  })

  it('Resend downloaded csv as bulk actions', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 3)

    const csvLines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { format: 'csv' } })).data

    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', csvLines, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 6)
    lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines.length, 6)
  })

  it('Validate bulk actions sent as csv', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'boolean' }]
    })
    await assert.rejects(ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attrko
    line1,test1
    line2,test1
    line3,test1`, { headers: { 'content-type': 'text/csv' } }), (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 1)
      assert.equal(err.data.nbOk, 0)
      return true
    })
  })

  it('Accept date detected as ISO by JS but not by elasticsearch', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restdate', {
      isRest: true,
      title: 'restdate',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    await ax.post('/api/v1/datasets/restdate/lines', { attr1: '1961-02-13 00:00:00+00:00' })
    await workers.hook('finalizer/restdate')
    let lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: '1961-02-14 00:00:00+00:00' })
    await workers.hook('finalizer/restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-14T00:00:00+00:00')

    await ax.patch('/api/v1/datasets/restdate/lines/' + lines[0]._id, { attr1: null })
    await workers.hook('finalizer/restdate')
    lines = (await ax.get('/api/v1/datasets/restdate/lines')).data.results
    assert.equal(lines.length, 1)
    assert.ok(!lines[0].attr1)
    return true
  })

  it('Accept date detected as ISO by JS but not by elasticsearch in bulk', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restdatebulk', {
      isRest: true,
      title: 'restdatebulk',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [
      { _id: '1', attr1: '1961-02-13 00:00:00+00:00', attr2: 'val1' },
      { _id: '2', attr1: '1961-02-13T00:00:00+00:00', attr2: 'val2' }
    ])
    await workers.hook('finalizer/restdatebulk')
    let lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[0].attr2, 'val2')
    assert.equal(lines[1].attr1, '1961-02-13T00:00:00+00:00')
    assert.equal(lines[1].attr2, 'val1')

    await ax.post('/api/v1/datasets/restdatebulk/_bulk_lines', [{ _id: lines[0]._id, attr1: null, _action: 'patch' }])
    await workers.hook('finalizer/restdatebulk')
    lines = (await ax.get('/api/v1/datasets/restdatebulk/lines')).data.results
    assert.equal(lines.length, 2)
    assert.ok(!lines[0].attr1)
    assert.equal(lines[0].attr2, 'val2')
    return true
  })

  it('Accept date detected as ISO by JS but not by elasticsearch in bulk CSV', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restcsv', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    const res = await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1
    line1,1961-02-13 00:00:00+00:00`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalizer/restcsv')
    const lines = (await ax.get('/api/v1/datasets/restcsv/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, '1961-02-13T00:00:00+00:00')
    return true
  })

  it('Ignore null values', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/restnull', {
      isRest: true,
      title: 'restnull',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/restnull/lines', { attr1: 'val1', attr2: null })
    await workers.hook('finalizer/restnull')
    const lines = (await ax.get('/api/v1/datasets/restnull/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0].attr1, 'val1')
    assert.ok(!('attr2' in lines[0]))
    return true
  })

  it.skip('Send multiple lines in parallel', async function () {
    // activate temporarily to check that we manage correctly parallel insertions
    // it is also necessary to change defaultLimits.apiRate.user.nb to support this number of requests

    const ax = global.ax.dmeadus
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

  it('Send bulk actions as a gzipped CSV', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restgzcsv', {
      isRest: true,
      title: 'restgzcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data
    await ax.post('/api/v1/datasets/restgzcsv/_bulk_lines', zlib.gzipSync(`_id,attr1,attr2
line1,test1,test1
line2,test1,test1`), { headers: { 'content-type': 'text/csv+gzip' } })
    dataset = await workers.hook('finalizer/restgzcsv')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restgzcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .csv file', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', `_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`, 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restcsvfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .csv file with other encoding', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvfile', {
      isRest: true,
      title: 'restcsvfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'testé2', type: 'string' }]
    })
    let dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', iconv.encode(`_id,attr1,testé2
    line1,test1,testé1
    line2,test1,testé1`, 'ISO-8859-1'), 'actions.csv')
    await ax.post('/api/v1/datasets/restcsvfile/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restcsvfile')
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
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvgz', {
      isRest: true,
      title: 'restcsvgz',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', zlib.gzipSync(`_id,attr1,attr2
    line1,test1,test1
    line2,test1,test1`), 'actions.csv.gz')
    await ax.post('/api/v1/datasets/restcsvgz/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restcsvgz')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvgz/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[1]._id, 'line2')
    assert.equal(lines[1].attr1, 'test1')
  })

  it('Send bulk as a .xlsx file', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restxlsxfile', {
      isRest: true,
      title: 'restxlsxfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', fs.readFileSync('./resources/datasets/actions.xlsx'), 'actions.xlsx')
    await ax.post('/api/v1/datasets/restxlsxfile/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restxlsxfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restxlsxfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  it('Send bulk as a .ods file', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restodsfile', {
      isRest: true,
      title: 'restodsfile',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data

    const form = new FormData()
    form.append('actions', fs.readFileSync('./resources/datasets/actions.xlsx'), 'actions.ods')
    await ax.post('/api/v1/datasets/restodsfile/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restodsfile')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restodsfile/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'Test1-2')
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr2, 'Test2-2')
  })

  it('Send bulk as a .zip file', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets/restcsvzip', {
      isRest: true,
      title: 'restcsvzip',
      schema: [{ key: 'id', type: 'string' }, { key: 'adr', type: 'string' }, { key: 'some date', type: 'string' }, { key: 'loc', type: 'string' }]
    })
    let dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    const actionsContent = fs.readFileSync('./resources/datasets/dataset1.zip')
    form.append('actions', actionsContent, 'dataset1.zip')
    await ax.post('/api/v1/datasets/restcsvzip/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook('finalizer/restcsvzip')
    assert.equal(dataset.count, 2)
    const lines = (await ax.get('/api/v1/datasets/restcsvzip/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].id, 'koumoul')
    assert.equal(lines[1].id, 'bidule')
  })

  it('Use the primary key defined by the user', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restkey')
    assert.equal(dataset.count, 2)
    let lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    // lines 2 and 3 of the CSV has the same primary key, so 3 overwrote 2
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr3, 'test3')

    // updating the primary key of a line is not allowed
    await assert.rejects(ax.post('/api/v1/datasets/restkey/lines', { _id: lines[0]._id, attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err) => err.status === 400)
    await assert.rejects(ax.put('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2', attr2: 'test2', attr3: 'test3' }), (err) => err.status === 400)
    await assert.rejects(ax.patch('/api/v1/datasets/restkey/lines/' + lines[0]._id, { attr1: 'test2' }), (err) => err.status === 400)

    // the primary key can also be used to delete lines
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', [
      { _action: 'delete', attr1: 'test1', attr2: 'test1' }
    ])
    dataset = await workers.hook('finalizer/restkey')
    assert.equal(dataset.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test2')
    assert.equal(lines[0].attr3, 'test3')

    // the primary key can also be used in a csv body
    res = await ax.post('/api/v1/datasets/restkey/_bulk_lines', `_action,attr1,attr2,attr3
patch,test2,test2,test2
patch,test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalizer/restkey')
    assert.equal(dataset.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr3, 'test3')
  })

  it('Perform CRUD operations in larger bulk and keep request alive', async function () {
    const ax = global.ax.dmeadus
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
      workers.hook('finalizer/rest2')
    ])
    assert.equal(i, 6)
  })

  it('Removing a property triggers mongo unset and reindexing', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/restunset', {
      isRest: true,
      title: 'restunset',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    let dataset = res.data
    res = await ax.post('/api/v1/datasets/restunset/lines', { attr1: 'test1', attr2: 'test1' })
    assert.equal(res.status, 201)
    dataset = await workers.hook('finalizer/restunset')
    const storage1 = dataset.storage.size

    res = await ax.patch('/api/v1/datasets/restunset', { schema: [{ key: 'attr1', type: 'string', readOnly: true }] })

    await workers.hook('indexer/restunset')
    dataset = await workers.hook('finalizer/restunset')
    const storage2 = dataset.storage.size
    assert.ok(storage2 < storage1)

    res = await ax.get('/api/v1/datasets/restunset/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0].attr2)
  })

  it('Activating/deactivating storeUpdatedBy', async function () {
    const ax = global.ax.dmeadusOrg
    let res = await ax.post('/api/v1/datasets/updatedby', {
      isRest: true,
      title: 'updatedby',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test1' })
    await workers.hook('finalizer/updatedby')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true } })

    await workers.hook('indexer/updatedby')
    await workers.hook('finalizer/updatedby')

    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.ok(!res.data.results[0]._updatedBy)
    const lineId = res.data.results[0]._id

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await workers.hook('finalizer/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(res.data.results[0].attr1)
    assert.equal(res.data.results[0]._updatedBy, 'dmeadus0')
    assert.equal(res.data.results[0]._updatedByName, 'Danna Meadus')

    res = await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { apiKeys: [{ title: 'api key', scopes: ['datasets'] }] })
    const apiKey = res.data.apiKeys[0]
    const axAPIKey = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': apiKey.clearKey } })
    await axAPIKey.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test3' })
    await workers.hook('finalizer/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.equal(res.data.results[0]._updatedBy, 'apiKey:' + apiKey.id)
    assert.equal(res.data.results[0]._updatedByName, 'api key')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: true, history: true } })
    await workers.hook('finalizer/updatedby')

    await ax.post('/api/v1/datasets/updatedby/lines', { attr1: 'test1', attr2: 'test2' })
    await workers.hook('finalizer/updatedby')
    res = await ax.get(`/api/v1/datasets/updatedby/lines/${lineId}/revisions`)
    assert.equal(res.data.results[0]._updatedBy, 'dmeadus0')
    assert.equal(res.data.results[0]._updatedByName, 'Danna Meadus')

    res = await ax.patch('/api/v1/datasets/updatedby', { rest: { storeUpdatedBy: false, history: true } })
    await workers.hook('finalizer/updatedby')
    res = await ax.get('/api/v1/datasets/updatedby/lines')
    assert.ok(!res.data.results[0]._updatedBy)
    assert.ok(!res.data.results[0]._updatedByName)
  })

  it('Use drop option to recreate all data', async function () {
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restdrop')
    assert.equal(dataset.count, 2)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test2-1' },
      { attr1: 'test2-2' }
    ])
    assert.equal(res.data.nbCreated, 2)
    dataset = await workers.hook('finalizer/restdrop')
    assert.equal(dataset.count, 4)

    res = await ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attr1: 'test3-1' },
      { attr1: 'test3-2' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 2)
    assert.equal(res.data.dropped, true)
    dataset = await workers.hook('finalizer/restdrop')
    assert.equal(dataset.count, 2)

    res = await ax.get('/api/v1/datasets/restdrop/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].attr1, 'test3-2')
    assert.equal(res.data.results[1].attr1, 'test3-1')

    await assert.rejects(ax.post('/api/v1/datasets/restdrop/_bulk_lines', [
      { attrko: 'ko' }
    ], { params: { drop: true } }), (res) => {
      assert.equal(res.status, 400)
      assert.equal(res.data.nbErrors, 1)
      assert.equal(res.data.cancelled, true)
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
    const ax = global.ax.dmeadus
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
    dataset = await workers.hook('finalizer/restdrophist')

    const lines = (await ax.get('/api/v1/datasets/restdrophist/lines')).data.results
    const line2 = lines.find(l => l.attr1 === 'test2')
    const line3 = lines.find(l => l.attr1 === 'test3')
    await ax.delete('/api/v1/datasets/restdrophist/lines/' + line3._id)
    dataset = await workers.hook('finalizer/restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v2' },
      { attr1: 'test2', attr2: 'v2' }
    ])
    dataset = await workers.hook('finalizer/restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v3' },
      { attr1: 'test3', attr2: 'v2' },
      { attr1: 'test4', attr2: 'v1' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 3)
    assert.equal(res.data.dropped, true)
    dataset = await workers.hook('finalizer/restdrophist')
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
    const ax = await global.ax.hlalonde3
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

    await workers.hook('finalizer/restdatetimeformat')
    res = await ax.get('/api/v1/datasets/restdatetimeformat/lines')
    assert.equal(res.data.total, 4)
  })

  it('Send geometries in a column', async function () {
    const ax = await global.ax.hlalonde3
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
      { attr1: 'test2', geom: '{ "type": "GeometryCollection", "geometries": [ { "type": "LineString", "coordinates": [ [251886.985899411, 6872275.12076354], [251888.207983521, 6872292.65793929], [251890.454033297, 6872315.5409094], [251893.697505195, 6872348.49231213], [251897.996450216, 6872384.52683849], [251902.294469564, 6872420.4468662], [251905.546270246, 6872454.42875726], [251907.873753365, 6872487.38756811], [251907.084788265, 6872517.27992072], [251901.258807214, 6872547.32749661], [251894.484448846, 6872573.37504226], [251889.755334072, 6872597.45945851], [251885.973671495, 6872625.42941052], [251887.181830399, 6872647.40473083], [251887.238278007, 6872654.389118], [251893.458715313, 6872687.31646898], [251897.732675134, 6872720.25955157], [251891.971467897, 6872758.32200672], [251884.296849522, 6872786.32343173], [251873.547421706, 6872816.41081373], [251862.797994124, 6872846.49819645], [251852.964554994, 6872876.5781754], [251845.313972946, 6872907.55651933], [251841.565590256, 6872939.64837115], [251840.776593724, 6872969.54069748], [251841.027337844, 6873000.56967491], [251841.285483951, 6873032.51463835], [251842.590772488, 6873066.51223829], [251846.864700741, 6873099.45528939], [251855.015855714, 6873130.42040544], [251861.21289813, 6873146.28658343], [251871.416702807, 6873176.20455713], [251883.681486305, 6873206.10587101], [251894.915780783, 6873236.0155157], [251906.150076806, 6873265.92516287], [251916.337228979, 6873293.78217276], [251925.60839308, 6873321.64658783], [251935.796471473, 6873349.61809837], [251942.787472665, 6873362.85660362], [251951.029897685, 6873378.46486731], [251966.271651947, 6873408.34212008], [251978.421015621, 6873438.12986611], [251985.647858976, 6873468.07191121], [251986.968881389, 6873504.01598985], [251988.28250165, 6873539.04408456], [251990.47140027, 6873569.02685801], [251993.788631782, 6873596.93940997], [251998.022778802, 6873624.95905592], [252006.173015829, 6873655.80968568], [252017.448029793, 6873690.75725799], [252024.094982038, 6873709.40811596], [252029.126325925, 6873722.82271812], [252036.882300944, 6873743.50174934], [252052.13979177, 6873775.32547793], [252070.390906839, 6873809.18610815], [252082.590932125, 6873831.07256452], [252090.480126886, 6873845.76460332], [252100.843182767, 6873865.06371057], [252110.03272217, 6873882.83628304], [252126.182150155, 6873911.67565717], [252135.357094337, 6873927.63227624], [252150.614590488, 6873959.45600805], [252163.811108951, 6873991.29640142], [252173.13132361, 6874025.22923321], [252183.375856857, 6874060.18514446], [252195.664714348, 6874093.06342843], [252202.777756918, 6874108.92221209], [252219.957679963, 6874137.75325941], [252241.682980772, 6874164.8834733], [252263.565365797, 6874192.65364785], [252281.389790307, 6874214.43235223], [252287.46375213, 6874221.85380003], [252298.928741773, 6874239.37777259], [252311.690573148, 6874260.9289564], [252325.25615508, 6874289.34105774], [252339.370096775, 6874319.76796773], [252353.588787362, 6874350.56955371], [252367.791747661, 6874379.42467008], [252381.087045808, 6874409.31767562], [252389.443896974, 6874427.98046355], [252395.372853403, 6874441.96888135], [252398.367964532, 6874449.03536392], [252403.49091416, 6874461.12213874], [252415.755724498, 6874491.02347714], [252424.912410513, 6874518.88884056], [252431.510563666, 6874542.78150156], [252435.505952542, 6874557.24925702], [252438.465872452, 6874580.72685041], [252445.725119802, 6874614.67635807], [252458.929980478, 6874647.54722994], [252467.074443767, 6874663.51216863], [252485.300599497, 6874694.28132538], [252505.564603497, 6874722.17136023], [252524.674366844, 6874748.92567038], [252544.938386935, 6874776.81570464], [252563.164569337, 6874807.58497282], [252571.30904047, 6874823.54991241], [252587.597061948, 6874855.36529604], [252600.793610037, 6874887.20568067], [252612.052004885, 6874920.09228968], [252617.211177155, 6874935.05082311], [252627.431678207, 6874967.02977993], [252637.651255455, 6874998.8942415], [252644.854070294, 6875025.85935256], [252655.220533292, 6875061.73032863], [252662.463137159, 6875093.61886512], [252664.603308603, 6875109.6967545], [252667.167607214, 6875128.96086826], [252670.178855316, 6875156.61031997], [252674.230461596, 6875189.4795401], [252676.451765304, 6875223.46979224], [252676.580384875, 6875239.38505543], [252675.335833968, 6875253.56119686], [252673.854171856, 6875270.43816901], [252666.081673118, 6875300.50154046], [252657.408911944, 6875332.51879142], [252646.699225605, 6875367.52966627], [252634.959972342, 6875402.6633739], [252623.212390384, 6875436.7665976], [252617.403713765, 6875454.7909825], [252605.671860796, 6875490.84067899], [252594.970498466, 6875526.88204296], [252590.08614101, 6875545.92950646], [252585.307949771, 6875563.94544358], [252575.645416074, 6875601.00896002], [252566.898873351, 6875638.06507005], [252557.228010284, 6875674.0981036], [252552.327001181, 6875691.08459867], [252544.603544958, 6875727.21639118], [252535.954842816, 6875762.21060472], [252534.395648435, 6875769.61397606], [252527.801991161, 6875800.92199802], [252525.39135374, 6875815.31219349], [252517.650313003, 6875849.26849536], [252511.849277273, 6875882.40757456], [252510.152625412, 6875913.33786255], [252512.324882625, 6875941.259723], [252516.542391837, 6875967.21844766], [252521.831106012, 6875998.20677254], [252525.074567948, 6876031.15822898], [252525.308669322, 6876060.12631231], [252522.53341018, 6876085.11102108], [252516.781175844, 6876110.11979557], [252501.026122175, 6876144.25540159], [252476.283699078, 6876171.47880896], [252459.351956873, 6876187.53200373], [252434.575661597, 6876208.95247906], [252430.64277767, 6876219.82573704], [252426.018841911, 6876234.17384312] ] }, { "type": "LineString", "coordinates": [ [250482.964576462, 6870975.61931764], [250486.963960431, 6870975.65004874], [250495.364785618, 6870975.39609193], [250513.812313618, 6870975.31557822], [250532.265054069, 6870975.1514928], [250540.930700373, 6870975.32850029], [250555.095813778, 6870975.65535817], [250559.943268555, 6870975.81623879], [250592.789706974, 6870977.95338066], [250613.683897067, 6870980.06038268], [250636.228202773, 6870982.99218225], [250650.887447279, 6870985.26886848], [250680.835492191, 6870990.22028911], [250716.247257768, 6870997.39844017], [250851.217300066, 6871029.87604536] ] }, { "type": "LineString", "coordinates": [ [248798.825510552, 6871121.45207027], [248835.313792437, 6871136.59720436], [248865.526277177, 6871140.90293807], [248897.892279304, 6871144.95177387], [248930.054109891, 6871150.39202404], [248963.977986423, 6871154.12564013], [248982.978646847, 6871153.90184715], [249011.418997978, 6871155.99745822], [249041.661832606, 6871157.30355372], [249068.541509103, 6871158.11989758], [249112.716830259, 6871155.92151653], [249136.730355083, 6871154.72648486], [249156.899580066, 6871151.53602083], [249190.85750675, 6871145.3073576], [249222.754483107, 6871139.09527445], [249252.696648247, 6871131.86846456], [249278.647104487, 6871126.62047274], [249297.621458746, 6871122.45945392], [249329.50178278, 6871114.18645614], [249357.391322973, 6871108.00675525], [249386.311305014, 6871101.81880049], [249417.622001399, 6871092.76745236], [249456.307640457, 6871083.66939707], [249482.355831971, 6871077.51583773], [249506.60376239, 6871072.41038808], [249561.943091033, 6871060.22741031], [249594.156043133, 6871052.72933452], [249621.617628532, 6871052.675908], [249651.568116559, 6871046.47961968], [249685.526037639, 6871040.25086983], [249715.483990321, 6871034.97048225], [249740.41226149, 6871030.76133987], [249770.395111076, 6871028.57244818], [249804.270002804, 6871026.23758178], [249835.283357574, 6871024.04034626], [249863.22098093, 6871023.81456135], [249897.218697885, 6871022.50924967], [249929.163766737, 6871022.25107595], [249958.131878516, 6871022.0169607], [249993.160080026, 6871020.70331815], [250024.058909787, 6871018.50697522], [250053.124872723, 6871016.21102072], [250082.16715417, 6871007.03623455], [250100.23696169, 6871004.82307282], [250118.961227804, 6871001.83992318], [250149.784964103, 6870996.92908554], [250181.011050597, 6870992.02569036], [250213.798078532, 6870988.40155632], [250224.925184747, 6870987.75789938], [250241.594031121, 6870986.88330928], [250270.416749361, 6870985.49416866], [250317.806821082, 6870982.93715176], [250409.728941233, 6870978.66389592], [250420.814244741, 6870978.02677555], [250447.597146191, 6870976.72042355], [250455.978578474, 6870976.09595916], [250459.975422124, 6870975.9501544] ] }, { "type": "LineString", "coordinates": [ [248180.064829366, 6873536.74967002], [248179.270001317, 6873528.29729637], [248186.504709663, 6873481.4127934], [248193.351365934, 6873447.72210991], [248194.39978367, 6873416.17203158], [248183.418216271, 6873379.76616466], [248181.689776662, 6873359.44736502], [248190.526533293, 6873323.92447848], [248200.641483771, 6873285.26286343], [248208.973578935, 6873251.82911482], [248219.041107293, 6873182.83475485], [248223.991476789, 6873151.77796454], [248226.491462532, 6873114.37993433], [248230.338359383, 6873081.91330731], [248233.815719109, 6873067.85255778], [248240.915557565, 6873052.63583439], [248254.613439841, 6873028.58318991], [248275.463370961, 6872995.83031246], [248307.115917654, 6872945.00354475], [248326.955149527, 6872916.1689367], [248345.289585876, 6872884.83337041], [248406.410021412, 6872780.75783496], [248454.067700671, 6872710.51185802], [248471.327658113, 6872685.08681802], [248482.653444016, 6872667.26939196], [248490.857697546, 6872650.25933065], [248498.523603483, 6872631.16811252], [248505.928902565, 6872612.07892964], [248516.119763725, 6872579.09709074], [248535.940341992, 6872505.67415159], [248542.31436333, 6872484.26816919], [248549.70660718, 6872449.71303822], [248551.037049899, 6872415.08996528], [248548.633962395, 6872380.5151272], [248549.978815249, 6872353.39403397], [248565.061694209, 6872219.806538], [248565.522129559, 6872202.01853135], [248565.623262301, 6872183.40759116], [248563.598332502, 6872163.36378052], [248556.861870102, 6872108.3039549], [248549.020537597, 6872073.43690576], [248544.89383235, 6872046.62072266], [248544.191523349, 6872024.20834133], [248553.220421113, 6871915.69458807], [248559.530501442, 6871890.09751228], [248567.198504149, 6871871.26690377], [248577.450266687, 6871849.548072], [248596.509468159, 6871820.98047729], [248671.420226669, 6871712.45154281], [248681.420149127, 6871697.86799264], [248700.992578941, 6871670.77621077], [248724.803501554, 6871632.51846942], [248736.066095049, 6871606.88137673], [248741.070600324, 6871581.03416936], [248742.680549296, 6871554.43218108], [248742.191623085, 6871461.6360634], [248743.316950618, 6871404.29285273], [248743.84936213, 6871360.75492275], [248744.579977723, 6871208.76222593], [248747.530464205, 6871184.97567841], [248751.738323605, 6871170.59534924], [248757.06210016, 6871158.75761141], [248771.094142153, 6871147.21088024] ] }, { "type": "Point", "coordinates": [248758.476399985, 6871130.30873396] } ] }' }
    ])
    assert.equal(res.data.nbOk, 2)

    await workers.hook('finalizer/restgeo')
    res = await ax.get('/api/v1/datasets/restgeo/lines?select=attr1,geom,_geopoint,_geocorners')
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geocorners)
    assert.ok(res.data.results[1]._geopoint)
    assert.ok(res.data.results[1]._geocorners)
  })

  it('Send attachment with special chars', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest attachment ko',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'Capture d’écran du 2024-11-19 10-20-57.png')
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/Capture d’écran du 2024-11-19 10-20-57.png'))
    await workers.hook('finalizer/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.headers['content-disposition'], "inline; filename=\"Capture d?écran du 2024-11-19 10-20-57.png\"; filename*=UTF-8''Capture%20d%E2%80%99%C3%A9cran%20du%202024-11-19%2010-20-57.png")
  })
})
