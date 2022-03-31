const path = require('path')
const fs = require('fs-extra')
const FormData = require('form-data')
const moment = require('moment')
const zlib = require('zlib')
const assert = require('assert').strict
const { Writable } = require('stream')
const pump = require('util').promisify(require('pump'))

const testUtils = require('./resources/test-utils')
const restDatasetsUtils = require('../server/utils/rest-datasets')
const datasetUtils = require('../server/utils/dataset')
const workers = require('../server/workers')

describe('REST datasets', () => {
  it('Create empty REST datasets', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'a-rest-dataset')
    await workers.hook('finalizer/' + res.data.id)

    res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'a-rest-dataset-2')
    await workers.hook('finalizer/' + res.data.id)

    res = await ax.put('/api/v1/datasets/restdataset3', { isRest: true, title: 'a rest dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'restdataset3')
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Perform CRUD operations on REST datasets', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/rest1')
    res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
    assert.equal(res.status, 201)
    assert.ok(res.data._id)
    assert.equal(res.data.attr1, 'test1')
    res = await ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test1')
    await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test2')
    await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
    res = await ax.get('/api/v1/datasets/rest1/lines/id1')
    assert.equal(res.data._id, 'id1')
    assert.equal(res.data.attr1, 'test3')
    assert.equal(res.data.attr2, 'test2')
    await ax.delete('/api/v1/datasets/rest1/lines/id1')
    await workers.hook('finalizer/rest1')
    await assert.rejects(ax.get('/api/v1/datasets/rest1/lines/id1'), (err) => {
      assert.equal(err.status, 404)
      return true
    })
    await assert.rejects(ax.patch('/api/v1/datasets/rest1/lines/id1', { _i: 10 }), (err) => {
      assert.equal(err.status, 400)
      return true
    })
  })

  it('Reject properly json missing content-type', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restjson',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/restjson')
    await assert.rejects(ax.post('/api/v1/datasets/restjson/lines', JSON.stringify({ attr1: 'test1', attr2: 'test1' })), (err) => {
      assert.equal(err.status, 415)
      assert.equal(err.data, 'Cette API attend un header content-type compatible, le plus souvent application/json.')
      return true
    })
  })

  it('Perform CRUD operations in bulks', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/rest2')
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
    let dataset = await workers.hook('finalizer/rest3')
    let res = await ax.post('/api/v1/datasets/rest3/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    dataset = await workers.hook('finalizer/rest3')
    assert.ok(dataset.schema.find(f => f.key === '_id'))
    assert.ok(dataset.schema.find(f => f.key === '_updatedAt'))
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 4)

    // check that _i is incremental and unique even inside the same bulk
    assert.ok(res.data.results[0]._i.toString().endsWith('03'))
    assert.ok(res.data.results[1]._i.toString().endsWith('02'))
    assert.ok(res.data.results[2]._i.toString().endsWith('01'))
    assert.ok(res.data.results[3]._i.toString().endsWith('00'))

    // Patch one through db query to check that it won't processed
    // we must be sure that the whole dataset is not reindexed each time, only the diffs
    const collection = restDatasetsUtils.collection(global.db, dataset)
    await collection.updateOne({ _id: 'line4' }, { $set: { attr2: 'altered' } })
    assert.equal((await collection.findOne({ _id: 'line4' })).attr2, 'altered')

    res = await ax.post('/api/v1/datasets/rest3/_bulk_lines', [
      { _action: 'delete', _id: 'line1' },
      { _action: 'patch', _id: 'line2', attr1: 'test2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 2)

    dataset = await workers.hook('finalizer/rest3')
    assert.ok(dataset.updatedAt > dataset.createdAt)
    assert.ok(dataset.dataUpdatedAt > dataset.updatedAt)
    assert.ok(dataset.finalizedAt > dataset.dataUpdatedAt)
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)
    assert.equal(dataset.count, 3)
    res = await ax.get('/api/v1/datasets/rest3/lines')
    assert.equal(res.data.total, 3)
    const line4 = res.data.results.find(r => r._id === 'line4')
    assert.equal(line4.attr2, 'test1')
  })

  it('Use dataset schema to validate inputs', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest4', {
      isRest: true,
      title: 'rest4',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/rest4')
    try {
      await ax.post('/api/v1/datasets/rest4/lines', { attr3: 'test1' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.post('/api/v1/datasets/rest4/lines', { attr1: 111 })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 111 })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.patch('/api/v1/datasets/rest4/lines/line1', { attr1: 111 })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }

    const res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
      { _id: 'line1', attr1: 'test' },
      { _id: 'line1', attr1: 111 }
    ])

    assert.equal(res.data.nbOk, 1)
    assert.equal(res.data.nbErrors, 1)
    assert.equal(res.data.errors.length, 1)
    assert.equal(res.data.errors[0].line, 1)
    assert.ok(res.data.errors[0].error)
  })

  it('Send attachment with multipart request', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data
    await workers.hook('finalizer/rest5')

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 10)
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.ok(res.data._id)
    assert.equal(res.data.attachmentPath, `${res.data._id}/test.pdf`)
    await workers.hook('finalizer/rest5')
    const ls = await datasetUtils.lsAttachments(dataset)
    assert.equal(ls.length, 1)
    assert.equal(ls[0], res.data.attachmentPath)

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')

    assert.equal((await fs.readdir('data/test/tmp')).length, 0)
  })

  it('Send attachments with bulk request', async () => {
    const ax = await global.ax.ngernier4
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest6',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data
    await workers.hook('finalizer/rest6')

    // Create a line with an attached file
    const form = new FormData()
    const attachmentsContent = fs.readFileSync('./test/resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line1', attr1: 'test1', attachmentPath: 'test.odt' },
      { _id: 'line2', attr1: 'test1', attachmentPath: 'dir1/test.pdf' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await workers.hook('finalizer/rest6')
    const ls = await datasetUtils.lsAttachments(dataset)
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find(l => l._id === 'line1')['_file.content'], 'This is a test libreoffice file.')
  })

  it('Synchronize all lines with the content of the attachments directory', async () => {
    const ax = await global.ax.ngernier4
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restsync',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ],
      primaryKey: ['attachmentPath']
    })
    let dataset = res.data
    await workers.hook('finalizer/restsync')

    // Create a line with an attached file
    const form = new FormData()
    const attachmentsContent = fs.readFileSync('./test/resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')

    res = await ax.post('/api/v1/datasets/restsync/_bulk_lines', form, {
      headers: testUtils.formHeaders(form),
      params: { lock: 'true' }
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook('finalizer/restsync')
    const ls = await datasetUtils.lsAttachments(dataset)
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
    await fs.remove(path.join(datasetUtils.attachmentsDir(dataset), 'test.odt'))
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbDeleted, 1)
    dataset = await workers.hook('finalizer/restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 1)
  })

  it('Send bulk requests in ndjson file', async () => {
    const ax = await global.ax.ngernier4
    let res = await ax.post('/api/v1/datasets', {
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
    await workers.hook('finalizer/restndjson')

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('test/resources/rest/access.log.ndjson'), 'actions.ndjson')
    res = await ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 20)

    await workers.hook('finalizer/restndjson')
    res = await ax.get('/api/v1/datasets/restndjson/lines')
    assert.equal(res.data.total, 20)
  })

  it('Send bulk requests in ndjson file and receive errors', async () => {
    const ax = await global.ax.ngernier4
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restndjson',
      schema: [
        { key: 'ip', type: 'string' },
        { key: 'date', type: 'string', format: 'date-time' }
      ]
    })
    await workers.hook('finalizer/restndjson')

    // Create a line with an attached file
    const form = new FormData()
    form.append('actions', await fs.readFile('test/resources/rest/access.log.ndjson'), 'actions.ndjson')
    await assert.rejects(ax.post('/api/v1/datasets/restndjson/_bulk_lines', form, { headers: testUtils.formHeaders(form) }), (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.data.nbErrors, 20)
      assert.equal(err.data.nbOk, 0)
      return true
    })
    assert.equal((await fs.readdir('data/test/tmp')).length, 0)
  })

  it('The size of the mongodb collection is part of storage consumption', async () => {
    // Load a few lines
    const ax = await global.ax.builder('ccherryholme1@icio.us:passwd')
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest7',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/rest7')
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

  it('Activate the history mode', async () => {
    const ax = await global.ax.hlalonde3
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'resthist',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/resthist')
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

    res = await ax.get('/api/v1/stats')
    const storageSize = res.data.limits.store_bytes.consumption
    assert.ok(storageSize > 280)
    res = await ax.get('/api/v1/datasets/resthist')
    assert.equal(res.data.storage.size, storageSize)
    assert.ok(res.data.storage.collection.size > 80)
    assert.ok(res.data.storage.revisions.size > 160)
    assert.equal(res.data.storage.revisions.size + res.data.storage.collection.size, storageSize)
  })

  it('Apply a TTL on some date-field', async () => {
    const ax = await global.ax.hlalonde3
    await ax.post('/api/v1/datasets', {
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
    await workers.hook('finalizer/restttl')
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(3, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(2, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'hours').toISOString() })
    await workers.hook('finalizer/restttl')
    let res = await ax.get('/api/v1/datasets/restttl/lines')
    assert.equal(res.data.total, 4)
    await workers.hook('ttlManager/restttl')
    await workers.hook('finalizer/restttl')
    res = await ax.get('/api/v1/datasets/restttl/lines')
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
    await workers.hook('finalizer/restidem')
    let res = await ax.post('/api/v1/datasets/restidem/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' },
      { _id: 'line3', attr1: 'test1', attr2: 'test1' },
      { _id: 'line4', attr1: 'test1', attr2: 'test1' }
    ])
    let dataset = await workers.hook('finalizer/restidem')
    res = await ax.get('/api/v1/datasets/restidem/lines')
    assert.equal(res.data.total, 4)

    const collection = restDatasetsUtils.collection(global.db, dataset)
    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' }
    ])
    await workers.hook('finalizer/restidem')
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 0)

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _action: 'delete', _id: 'line2' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    await workers.hook('finalizer/restidem')

    res = await ax.post('/api/v1/datasets/restidem/_bulk_lines', [
      { _action: 'patch', _id: 'line3', attr1: 'test2' },
      { _action: 'patch', _id: 'line4', attr1: 'test1' }
    ])
    assert.equal(await collection.countDocuments({ _needsIndexing: true }), 1)
    dataset = await workers.hook('finalizer/restidem')
    assert.equal(dataset.count, 3)
  })

  it('Delete all lines from a rest dataset', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restdel',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = await workers.hook('finalizer/restdel')
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
    const collection = restDatasetsUtils.collection(global.db, dataset)
    assert.equal(await collection.countDocuments({}), 0)
  })

  it('Send bulk actions as a CSV', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'boolean' }]
    })
    let dataset = await workers.hook('finalizer/restcsv')
    await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1,attr2,attr3
line1,test1,test1,oui
line2,test1,test1,non
line3,test1,test1,true`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalizer/restcsv')
    assert.equal(dataset.count, 3)
    let lines = (await ax.get('/api/v1/datasets/restcsv/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0]._id, 'line1')
    assert.equal(lines[0].attr1, 'test1')
    assert.equal(lines[0].attr2, 'test1')
    assert.equal(lines[0].attr3, true)
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
  })

  it('Validate bulk actions sent as csv', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'boolean' }]
    })
    await workers.hook('finalizer/restcsv')
    await assert.rejects(ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attrko
    line1,test1
    line2,test1
    line3,test1`, { headers: { 'content-type': 'text/csv' } }), (err) => {
      assert.equal(err.data.nbErrors, 1)
      assert.equal(err.data.nbOk, 0)
      return true
    })
  })

  it('Accept date detected as ISO by JS but not by elasticsearch in bulk CSV', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restcsv',
      schema: [{ key: 'attr1', type: 'string', format: 'date-time' }]
    })
    await workers.hook('finalizer/restcsv')
    const res = await ax.post('/api/v1/datasets/restcsv/_bulk_lines', `_id,attr1
    line1,1961-02-13 00:00:00+00:00`, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.nbErrors, 0)
    assert.equal(res.data.nbOk, 1)
    await workers.hook('finalizer/restcsv')
    return true
  })

  it('Send bulk actions as a gzipped CSV', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restgzcsv',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = await workers.hook('finalizer/restgzcsv')
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

  it('Send bulk as a .csv.gz file', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restcsvgz',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    let dataset = await workers.hook('finalizer/restcsvgz')

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

  it('Use the primary key defined by the user', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restkey',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }],
      primaryKey: ['attr1', 'attr2']
    })
    let dataset = await workers.hook('finalizer/restkey')
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', `attr1,attr2,attr3
test1,test1,test1
test2,test2,test2
test2,test2,test3`, { headers: { 'content-type': 'text/csv' } })
    dataset = await workers.hook('finalizer/restkey')
    assert.equal(dataset.count, 2)
    let lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test1')
    // lines 2 and 3 of the CSV ha the same primary key, so 3 overwrote 2
    assert.equal(lines[1].attr1, 'test2')
    assert.equal(lines[1].attr3, 'test3')

    // the primary key can also be used to delete lines
    await ax.post('/api/v1/datasets/restkey/_bulk_lines', [
      { _action: 'delete', attr1: 'test1', attr2: 'test1' }
    ])
    dataset = await workers.hook('finalizer/restkey')
    assert.equal(dataset.count, 1)
    lines = (await ax.get('/api/v1/datasets/restkey/lines', { params: { sort: '_i' } })).data.results
    assert.equal(lines[0].attr1, 'test2')
    assert.equal(lines[0].attr3, 'test3')
  })

  it('Perform CRUD operations in larger bulk and keep request alive', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'restlarge',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    await workers.hook('finalizer/rest2')
    const bulkLines = []
    for (let i = 0; i < 550; i++) {
      bulkLines.push({ attr1: 'test' + i })
    }
    const res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', bulkLines, { responseType: 'stream' })
    let i = 0
    await pump(res.data, new Writable({
      write (chunk, encoding, callback) {
        i += 1
        if (i < 6) assert.equal(chunk.toString(), ' ')
        else {
          const result = JSON.parse(chunk.toString())
          assert.equal(result.nbOk, 550)
        }
        callback()
      }
    }))
    assert.equal(i, 6)
  })

  it('Removing a property triggers mongo unset and reindexing', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'restunset',
      schema: [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    })
    let dataset = await workers.hook('finalizer/restunset')
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
})
