const testUtils = require('./resources/test-utils')
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
  let res = await ax.post('/api/v1/datasets', { isRest: true, title: 'rest1' })
  res = await ax.post('/api/v1/datasets/rest1/lines', { attr1: 'test1', attr2: 'test1' })
  t.is(res.status, 201)
  t.truthy(res.data.id)
  t.is(res.data.attr1, 'test1')
  res = await ax.post('/api/v1/datasets/rest1/lines', { id: 'id1', attr1: 'test1', attr2: 'test1' })
  t.is(res.data.id, 'id1')
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data.id, 'id1')
  t.is(res.data.attr1, 'test1')
  await ax.put('/api/v1/datasets/rest1/lines/id1', { attr1: 'test2', attr2: 'test2' })
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data.id, 'id1')
  t.is(res.data.attr1, 'test2')
  await ax.patch('/api/v1/datasets/rest1/lines/id1', { attr1: 'test3' })
  res = await ax.get('/api/v1/datasets/rest1/lines/id1')
  t.is(res.data.id, 'id1')
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
  await ax.put('/api/v1/datasets/rest1', { isRest: true, title: 'rest1' })
  let res = await ax.post('/api/v1/datasets/rest1/_bulk_lines', [
    { attr1: 'test1', attr2: 'test1' },
    { id: 'line2', attr1: 'test1', attr2: 'test1' },
    { id: 'line3', attr1: 'test1', attr2: 'test1' },
    { id: 'line4', attr1: 'test1', attr2: 'test1' },
    { _action: 'delete', id: 'line2' },
    { _action: 'patch', id: 'line3', attr1: 'test2' },
    { _action: 'update', id: 'line4', attr1: 'test2', attr2: 'test2' }
  ])
  t.is(res.data.length, 7)
  try {
    await ax.get('/api/v1/datasets/rest1/lines/line2')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
  res = await ax.get('/api/v1/datasets/rest1/lines/line3')
  t.is(res.data.attr1, 'test2')
  t.is(res.data.attr2, 'test1')
  res = await ax.get('/api/v1/datasets/rest1/lines/line4')
  t.is(res.data.attr1, 'test2')
  t.is(res.data.attr2, 'test2')
})

test.only('Index and finalize dataset after write', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  await ax.put('/api/v1/datasets/rest1', { isRest: true, title: 'rest1' })
  let res = await ax.post('/api/v1/datasets/rest1/_bulk_lines', [
    { id: 'line1', attr1: 'test1', attr2: 'test1' },
    { id: 'line2', attr1: 'test1', attr2: 'test1' },
    { id: 'line3', attr1: 'test1', attr2: 'test1' },
    { id: 'line4', attr1: 'test1', attr2: 'test1' }
  ])
  await workers.hook(`indexer/rest1`)
  await workers.hook(`finalizer/rest1`)
  res = await ax.get('/api/v1/datasets/rest1/lines')
  t.is(res.data.total, 4)

  console.log('ROUND 2')
  res = await ax.post('/api/v1/datasets/rest1/_bulk_lines', [
    { _action: 'delete', id: 'line1' },
    { _action: 'patch', id: 'line2', attr1: 'test2' }
  ])

  await workers.hook(`finalizer/rest1`)
  res = await ax.get('/api/v1/datasets/rest1/lines')
  t.is(res.data.total, 3)
})
// TODO: schema verification

// TODO: indexing (only updated lines)

// TODO: finalization (bbox, etc.)

// TODO: extensions (only updated lines)

// TODO: attachments with multipart requests
