const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const restDatasetsUtils = require('../server/utils/rest-datasets')
const datasetUtils = require('../server/utils/dataset')
const { test, axiosBuilder } = testUtils.prepare(__filename)
const workers = require('../server/workers')

test.serial('Create empty REST datasets', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
  t.is(res.status, 201)
  t.is(res.data.id, 'a-rest-dataset')

  res = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
  t.is(res.status, 201)
  t.is(res.data.id, 'a-rest-dataset-2')

  res = await ax.put('/api/v1/datasets/restdataset3', { isRest: true, title: 'a rest dataset' })
  t.is(res.status, 201)
  t.is(res.data.id, 'restdataset3')
})

test.serial('Perform CRUD operations on REST datasets', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: 'rest1',
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
  })
  res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
  t.is(res.status, 201)
  t.truthy(res.data._id)
  t.is(res.data.attr1, 'test1')
  res = await ax.post('/api/v1/datasets/rest1/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
  t.is(res.data._id, 'id1')
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data._id, 'id1')
  t.is(res.data.attr1, 'test1')
  await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data._id, 'id1')
  t.is(res.data.attr1, 'test2')
  await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data._id, 'id1')
  t.is(res.data.attr1, 'test3')
  t.is(res.data.attr2, 'test2')
  await ax.delete('/api/v1/datasets/rest1/lines/id1')
  try {
    await ax.get('/api/v1/datasets/rest1/lines/id1')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})

test.serial('Perform CRUD operations in bulks', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  await ax.put('/api/v1/datasets/rest2', {
    isRest: true,
    title: 'rest2',
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
  })
  await workers.hook(`indexer/rest2`)
  let res = await ax.post('/api/v1/datasets/rest2/_bulk_lines', [
    { attr1: 'test1', attr2: 'test1' },
    { _id: 'line2', attr1: 'test1', attr2: 'test1' },
    { _id: 'line3', attr1: 'test1', attr2: 'test1' },
    { _id: 'line4', attr1: 'test1', attr2: 'test1' },
    { _action: 'delete', _id: 'line2' },
    { _action: 'patch', _id: 'line3', attr1: 'test2' },
    { _action: 'update', _id: 'line4', attr1: 'test2', attr2: 'test2' }
  ])
  t.is(res.data.length, 7)
  try {
    await ax.get('/api/v1/datasets/rest2/lines/line2')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
  res = await ax.get('/api/v1/datasets/rest2/lines/line3')
  t.is(res.data.attr1, 'test2')
  t.is(res.data.attr2, 'test1')
  res = await ax.get('/api/v1/datasets/rest2/lines/line4')
  t.is(res.data.attr1, 'test2')
  t.is(res.data.attr2, 'test2')
})

test.serial('Index and finalize dataset after write', async t => {
  // Load a few lines
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  await ax.put('/api/v1/datasets/rest3', {
    isRest: true,
    title: 'rest3',
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
  })
  let dataset = await workers.hook(`indexer/rest3`)
  let res = await ax.post('/api/v1/datasets/rest3/_bulk_lines', [
    { _id: 'line1', attr1: 'test1', attr2: 'test1' },
    { _id: 'line2', attr1: 'test1', attr2: 'test1' },
    { _id: 'line3', attr1: 'test1', attr2: 'test1' },
    { _id: 'line4', attr1: 'test1', attr2: 'test1' }
  ])
  await workers.hook(`indexer/rest3`)
  dataset = await workers.hook(`finalizer/rest3`)
  t.truthy(dataset.schema.find(f => f.key === '_id'))
  t.truthy(dataset.schema.find(f => f.key === '_updatedAt'))
  res = await ax.get('/api/v1/datasets/rest3/lines')
  t.is(res.data.total, 4)

  // Patch one through db query to check that it won't processed
  // we must be sure that the whole dataset is not reindexed each time, only the diffs
  const collection = restDatasetsUtils.collection(test.app.get('db'), dataset)
  await collection.updateOne({ _id: 'line4' }, { $set: { attr2: 'altered' } })
  t.is((await collection.findOne({ _id: 'line4' })).attr2, 'altered')

  res = await ax.post('/api/v1/datasets/rest3/_bulk_lines', [
    { _action: 'delete', _id: 'line1' },
    { _action: 'patch', _id: 'line2', attr1: 'test2' }
  ])
  t.is(await collection.countDocuments({ _needsIndexing: true }), 2)

  dataset = await workers.hook(`finalizer/rest3`)
  t.is(await collection.countDocuments({ _needsIndexing: true }), 0)
  t.is(dataset.count, 3)
  res = await ax.get('/api/v1/datasets/rest3/lines')
  t.is(res.data.total, 3)
  const line4 = res.data.results.find(r => r._id === 'line4')
  t.is(line4.attr2, 'test1')
})

test.serial('Use dataset schema to validate inputs', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  await ax.put('/api/v1/datasets/rest4', {
    isRest: true,
    title: 'rest4',
    schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
  })
  await workers.hook(`indexer/rest4`)
  try {
    await ax.post('/api/v1/datasets/rest4/lines', { attr3: 'test1' })
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.post('/api/v1/datasets/rest4/lines', { attr1: 111 })
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.put('/api/v1/datasets/rest4/lines/line1', { attr1: 111 })
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.patch('/api/v1/datasets/rest4/lines/line1', { attr1: 111 })
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }

  let res = await ax.post('/api/v1/datasets/rest4/_bulk_lines', [
    { _id: 'line1', attr1: 'test' },
    { _id: 'line1', attr1: 111 }
  ])

  t.is(res.data.length, 2)
  t.is(res.data[0]._action, 'create')
  t.is(res.data[0]._status, 200)
  t.is(res.data[1]._action, 'create')
  t.is(res.data[1]._status, 400)
  t.truthy(res.data[1]._error)
})

test.serial('Send attachment with multipart request', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: 'rest5',
    schema: [
      { key: 'attr1', type: 'string' },
      { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
    ]
  })
  let dataset = res.data

  // Create a line with an attached file
  const form = new FormData()
  const attachmentContent = fs.readFileSync('./test/resources/files/dir1/test.pdf')
  form.append('attachment', attachmentContent, 'dir1/test.pdf')
  form.append('attr1', 'test1')
  res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  t.truthy(res.data._id)
  t.is(res.data.attachmentPath, `${res.data._id}/test.pdf`)
  const ls = await datasetUtils.lsAttachments(dataset)
  t.is(ls.length, 1)
  t.is(ls[0], res.data.attachmentPath)

  await workers.hook(`finalizer/rest5`)
  res = await ax.get('/api/v1/datasets/rest5/lines')
  t.is(res.data.total, 1)
  t.is(res.data.results[0]['_file.content'], 'This is a test pdf file.')
})

test.serial('Send attachments with bulk request', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: 'rest6',
    schema: [
      { key: 'attr1', type: 'string' },
      { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
    ]
  })
  let dataset = res.data

  // Create a line with an attached file
  const form = new FormData()
  const attachmentsContent = fs.readFileSync('./test/resources/files.zip')
  form.append('attachments', attachmentsContent, 'files.zip')
  form.append('actions', Buffer.from(JSON.stringify([
    { _id: 'line1', attr1: 'test1', attachmentPath: 'test.odt' },
    { _id: 'line2', attr1: 'test1', attachmentPath: 'dir1/test.pdf' }
  ]), 'utf8'), 'actions.json')
  res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 200)
  t.is(res.data.length, 2)
  const ls = await datasetUtils.lsAttachments(dataset)
  t.is(ls.length, 2)
  t.is(ls[0], res.data[0].attachmentPath)

  await workers.hook(`finalizer/rest6`)
  res = await ax.get('/api/v1/datasets/rest6/lines')
  t.is(res.data.total, 2)
  t.is(res.data.results.find(l => l._id === 'line1')['_file.content'], 'This is a test libreoffice file.')
})

// TODO: extensions (only updated lines)

// TODO: storage consumption

// TODO: document routes in API doc
