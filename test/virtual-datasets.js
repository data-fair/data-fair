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
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    virtual: {
      children: [dataset.id]
    },
    title: 'a virtual dataset'
  })
  const virtualDataset = res.data
  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  t.is(res.status, 200)
  t.is(res.data.total, 2)
})

test.serial('Create a virtual dataset, add children and query', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset1 = await testUtils.sendDataset('dataset1.csv', ax)
  const dataset2 = await testUtils.sendDataset('dataset1.csv', ax)
  const dataset3 = await testUtils.sendDataset('dataset1.csv', ax)
  // last one is not a child, it should not be used
  await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset'
  })
  const virtualDataset = res.data
  try {
    await workers.hook('finalizer/' + virtualDataset.id)
    t.fail('finalization without children should fail')
  } catch (err) {}
  await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
    virtual: {
      children: [dataset1.id, dataset2.id, dataset3.id]
    },
    schema: [{
      key: 'id'
    }]
  })
  await workers.hook('finalizer/' + virtualDataset.id)
  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  t.is(res.data.total, 6)
  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
  t.is(res.data.total, 3)
})

test.serial('Check compatibility of schema with children', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset.id]
    },
    schema: [{
      key: 'id'
    }]
  })
  const virtualDataset = await workers.hook('finalizer/' + res.data.id)
  t.truthy(virtualDataset.schema.find(f => f.key === 'id'))
  t.truthy(virtualDataset.schema.find(f => f.key === 'id').type === 'string')
  try {
    await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      schema: [{
        key: 'badKey'
      }]
    })
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }
})

test.serial('Check that column restriction is enforced (select, search, aggs)', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset.id]
    },
    schema: [{
      key: 'adr'
    }]
  })
  const virtualDataset = await workers.hook('finalizer/' + res.data.id)
  t.falsy(virtualDataset.schema.find(f => f.key === 'id'))

  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
  t.is(res.data.total, 0, 'cannot match on a field not from the schema')
  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'koumoul' } })
  t.is(res.data.total, 0, 'cannot match on a field not from the schema')

  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'id:koumoul' } })
    t.fail('cannot match on a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'test AND (id:koumoul OR test)' } })
    t.fail('cannot match on a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }

  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:adr' } })
  t.is(res.status, 200)
  t.is(res.data.total, 2)
  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:id' } })
    t.fail('cannot sort on a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { sort: 'koumoul' } })
    t.fail('cannot sort on a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { select: 'id,adr' } })
    t.fail('cannot select a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }

  try {
    await ax.get(`/api/v1/datasets/${virtualDataset.id}/values_agg`, { params: { field: 'id' } })
    t.fail('cannot aggregate on a field not from the schema')
  } catch (err) {
    t.is(err.status, 400)
  }
})

test.serial('Apply static filter', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset.id],
      filters: [{
        key: 'id',
        values: ['koumoul']
      }]
    },
    schema: [{
      key: 'adr'
    }]
  })
  const virtualDataset = await workers.hook('finalizer/' + res.data.id)
  t.falsy(virtualDataset.schema.find(f => f.key === 'id'))

  res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  t.is(res.data.total, 1, 'return matching line')
})

test.serial('Add another virtual dataset as child', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset.id]
    },
    schema: [{
      key: 'adr'
    }]
  })
  const virtualDataset = await workers.hook('finalizer/' + res.data.id)

  res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [virtualDataset.id]
    },
    schema: [{
      key: 'adr'
    }]
  })
  const virtualDataset2 = await workers.hook('finalizer/' + res.data.id)

  res = await ax.put('/api/v1/datasets/my-id3', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [virtualDataset2.id]
    },
    schema: [{
      key: 'adr'
    }]
  })
  const virtualDataset3 = await workers.hook('finalizer/' + res.data.id)

  res = await ax.get(`/api/v1/datasets/${virtualDataset3.id}/lines`)
  t.is(res.data.total, 2, 'return matching line')
})

test.serial('A virtual dataset without physical children cannot be queried', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: []
    }
  })

  res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [res.data.id]
    }
  })

  try {
    await ax.get(`/api/v1/datasets/${res.data.id}/lines`)
    t.fail('no physical children should fail')
  } catch (err) {
    t.is(err.status, 500)
  }
})

test.serial('A virtual dataset cannot have a child virtual dataset with filters (no way to enforce them)', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  let res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [dataset.id],
      filters: [{
        key: 'id',
        values: ['koumoul']
      }]
    },
    schema: [{
      key: 'adr'
    }]
  })

  res = await ax.post('/api/v1/datasets', {
    isVirtual: true,
    title: 'a virtual dataset',
    virtual: {
      children: [res.data.id]
    }
  })

  try {
    await ax.get(`/api/v1/datasets/${res.data.id}/lines`)
    t.fail('filter in child should fail')
  } catch (err) {
    t.is(err.status, 500)
  }
})

//

// Check that column restriction from virtual child is enforced

// Check presence of calculated fields (bbox, cardinality, etc.)
// let virtualDataset = await workers.hook('finalizer/' + res.data.id)
// t.is(virtualDataset.status, 'finalized')

// Check that it is possible to list the virtual datasets that use a dataset

// Check that updating / deleting a child impacts the parents (and other ancestors)
