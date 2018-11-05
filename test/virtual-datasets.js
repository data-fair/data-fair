const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)
const workers = require('../server/workers')

test.serial('Create an empty virtual dataset', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
  t.is(res.status, 201)
  t.is(res.data.id, 'a-virtual-dataset')
})

test.serial('Create a new virtual dataset with predefined id', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.put('/api/v1/datasets/my-id', { isVirtual: true, title: 'a virtual dataset' })
  t.is(res.status, 201)
  t.is(res.data.id, 'my-id')
})

test.serial('Create a virtual dataset with a child and query', async t => {
  // Send basic dataset
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.put('/api/v1/datasets/my-id', {
    isVirtual: true,
    virtual: {
      children: [dataset.id]
    },
    title: 'a virtual dataset'
  })
  res = await ax.get('/api/v1/datasets/my-id/lines')
  t.is(res.status, 200)
  t.is(res.data.total, 2)
})

test.serial('Create a virtual dataset, add children and query', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset1 = await testUtils.sendDataset('dataset1.csv', ax)
  const dataset2 = await testUtils.sendDataset('dataset1.csv', ax)
  const dataset3 = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.put('/api/v1/datasets/my-id', {
    isVirtual: true,
    title: 'a virtual dataset'
  })
  await workers.hook('finalizer/my-id')
  await ax.patch('/api/v1/datasets/my-id', {
    virtual: {
      children: [dataset1.id, dataset2.id, dataset3.id]
    }
  })
  res = await ax.get('/api/v1/datasets/my-id/lines')
  t.is(res.data.total, 6)
  res = await ax.get('/api/v1/datasets/my-id/lines', { params: { q: 'koumoul' } })
  t.is(res.data.total, 3)
})

test.serial('Check compatibility of schema with children', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset1 = await testUtils.sendDataset('dataset1.csv', ax)
  await ax.put('/api/v1/datasets/my-id', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset1.id]
    },
    schema: [{
      key: 'id',
      type: 'string'
    }]
  })

  try {
    await ax.patch('/api/v1/datasets/my-id', {
      schema: [{
        key: 'badKey',
        type: 'string'
      }]
    })
  } catch (err) {
    t.is(err.status, 400)
  }
})

// Add another virtual dataset as child

// Check that column restriction is enforced (select, search, aggs)

// Check that column restriction from virtual child is enforced

// Check that static filter is enforced

// Check presence of calculated fields (bbox, cardinality, etc.)
// let virtualDataset = await workers.hook('finalizer/' + res.data.id)
// t.is(virtualDataset.status, 'finalized')

// Check that it is possible to list the virtual datasets that use a dataset
