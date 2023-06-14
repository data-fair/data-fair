const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('virtual datasets', () => {
  it('Create an empty virtual dataset', async () => {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'a-virtual-dataset')
  })

  it('Create a new virtual dataset with predefined id', async () => {
    const ax = global.ax.dmeadus
    const res = await ax.put('/api/v1/datasets/my-id', { isVirtual: true, title: 'a virtual dataset' })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'my-id')
  })

  it('Create a virtual dataset with a child and query', async () => {
    // Send basic dataset
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [dataset.id]
      },
      title: 'a virtual dataset'
    })
    const virtualDataset = res.data
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  it('Create a virtual dataset, add children and query', async () => {
    const ax = global.ax.dmeadus
    const dataset1 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const dataset3 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    // last one is not a child, it should not be used
    await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data
    try {
      await workers.hook('finalizer/' + virtualDataset.id)
      assert.fail('finalization without children should fail')
    } catch (err) {}
    await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      virtual: {
        children: [dataset1.id, dataset2.id, dataset3.id]
      },
      schema: [{
        key: 'id'
      }]
    })
    virtualDataset = await workers.hook('finalizer/' + virtualDataset.id)
    assert.equal(virtualDataset.count, 6)
    assert.equal(virtualDataset.dataUpdatedAt, dataset3.dataUpdatedAt)
    assert.deepEqual(virtualDataset.dataUpdatedBy, dataset3.dataUpdatedBy)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/api-docs.json`)
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.0.0')
    res = await ax.post('/api/v1/_check-api', res.data)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.total, 6)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
    assert.equal(res.data.total, 3)
  })

  it('Check compatibility of schema with children', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
    assert.ok(virtualDataset.schema.find(f => f.key === 'id'))
    assert.ok(virtualDataset.schema.find(f => f.key === 'id').type === 'string')
    res = await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      schema: [{
        key: 'badKey'
      }]
    })
    assert.ok(res.data.schema.find(f => f.key === 'badKey'))
  })

  it('Compatibility is accepted for integer/number types', async () => {
    const ax = global.ax.dmeadus
    const datasetNum = await testUtils.sendDataset('datasets/dataset-number.csv', ax)
    let datasetInt = await testUtils.sendDataset('datasets/dataset-integer.csv', ax)
    assert.equal(datasetInt.schema.find(p => p.key === 'num').type, 'integer')
    try {
      await ax.post('/api/v1/datasets', {
        isVirtual: true,
        title: 'a virtual dataset',
        virtual: {
          children: [datasetNum.id, datasetInt.id]
        },
        schema: [{ key: 'str' }, { key: 'num' }]
      })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }

    datasetInt.schema.find(p => p.key === 'num').ignoreIntegerDetection = true
    await ax.patch('/api/v1/datasets/' + datasetInt.id, {
      schema: datasetInt.schema
    })
    datasetInt = await workers.hook('finalizer/' + datasetInt.id)
    assert.equal(datasetInt.schema.find(p => p.key === 'num').type, 'number')

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [datasetNum.id, datasetInt.id]
      },
      schema: [{ key: 'str' }, { key: 'num' }]
    })
    const virtualDataset = await workers.hook('finalizer/' + res.data.id)
    assert.equal(virtualDataset.schema.find(p => p.key === 'num').type, 'number')
  })

  it('Check that column restriction is enforced (select, search, aggs)', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
    assert.ok(!virtualDataset.schema.find(f => f.key === 'id'))

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
    assert.equal(res.data.total, 0, 'cannot match on a field not from the schema')
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'koumoul' } })
    assert.equal(res.data.total, 0, 'cannot match on a field not from the schema')

    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'id:koumoul' } })
      assert.fail('cannot match on a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'test AND (id:koumoul OR test)' } })
      assert.fail('cannot match on a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:adr' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:id' } })
      assert.fail('cannot sort on a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { sort: 'koumoul' } })
      assert.fail('cannot sort on a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { select: 'id,adr' } })
      assert.fail('cannot select a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }

    try {
      await ax.get(`/api/v1/datasets/${virtualDataset.id}/values_agg`, { params: { field: 'id' } })
      assert.fail('cannot aggregate on a field not from the schema')
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('Apply static filter', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
    assert.ok(!virtualDataset.schema.find(f => f.key === 'id'))

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.total, 1, 'return matching line')
  })

  it('Add another virtual dataset as child', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
    assert.equal(res.data.total, 2, 'return matching line')
  })

  it('A virtual dataset without physical children cannot be queried', async () => {
    const ax = global.ax.dmeadus
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
      assert.fail('no physical children should fail')
    } catch (err) {
      assert.equal(err.status, 501)
    }
  })

  it('A virtual dataset cannot have a child virtual dataset with filters (no way to enforce them)', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
      assert.fail('filter in child should fail')
    } catch (err) {
      assert.equal(err.status, 501)
    }
  })

  it('A virtual dataset is updated after a child schema changes', async () => {
    // Send basic dataset
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [dataset.id]
      },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    const virtualDataset = res.data

    let dateField = dataset.schema.find(f => f.key === 'some_date')
    let virtualDateField = virtualDataset.schema.find(f => f.key === 'some_date')
    assert.equal(virtualDateField.format, 'date')

    dateField.ignoreDetection = true
    res = await ax.patch('/api/v1/datasets/' + dataset.id, {
      schema: dataset.schema
    })
    dataset = await workers.hook('finalizer/' + dataset.id)
    dateField = dataset.schema.find(f => f.key === 'some_date')
    assert.equal(dateField.format, undefined)

    virtualDateField = await workers.hook('finalizer/' + virtualDataset.id)
    virtualDateField = virtualDataset.schema.find(f => f.key === 'some_date')

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  it('A virtual dataset is updated after a child schema changes', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [dataset.id] },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data

    let dateField = dataset.schema.find(f => f.key === 'some_date')
    let virtualDateField = virtualDataset.schema.find(f => f.key === 'some_date')
    assert.equal(virtualDateField.format, 'date')

    dateField.ignoreDetection = true
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    dataset = await workers.hook('finalizer/' + dataset.id)
    dateField = dataset.schema.find(f => f.key === 'some_date')
    assert.equal(dateField.format, undefined)

    virtualDataset = await workers.hook('finalizer/' + virtualDataset.id)
    virtualDateField = virtualDataset.schema.find(f => f.key === 'some_date')
    assert.equal(virtualDateField.format, undefined)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  it('A virtual dataset is in error if children become inconsistent', async () => {
    // Send basic dataset
    const ax = global.ax.dmeadus
    const dataset1 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [dataset1.id, dataset2.id] },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data

    const dateField = dataset1.schema.find(f => f.key === 'some_date')
    dateField.ignoreDetection = true
    res = await ax.patch('/api/v1/datasets/' + dataset1.id, { schema: dataset1.schema })
    await workers.hook('finalizer/' + dataset1.id)

    try {
      virtualDataset = await workers.hook('finalizer/' + virtualDataset.id)
      assert.fail()
    } catch (err) {
      assert.equal(err.message, 'Le champ "some_date" a des formats contradictoires (non défini, date).')
    }
    virtualDataset = (await ax.get('/api/v1/datasets/' + virtualDataset.id)).data
    assert.equal(virtualDataset.status, 'error')
  })

  it('A virtual dataset cannot have a private child from another owner', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const res = await global.ax.cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })

    try {
      await global.ax.cdurning2.get(`/api/v1/datasets/${res.data.id}/lines`)
      assert.fail('filter in child should fail')
    } catch (err) {
      assert.equal(err.status, 501)
    }
  })

  it('A virtual dataset can have a public child from another owner', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'] }
    ])

    const res = await global.ax.cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })

    await global.ax.cdurning2.get(`/api/v1/datasets/${res.data.id}/lines`)
  })

  it('A virtual dataset has the most restrictive capabilities of its children', async () => {
    const ax = global.ax.dmeadus
    const child1 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    child1.schema[0]['x-capabilities'] = { text: false, values: false }
    await ax.patch('/api/v1/datasets/' + child1.id, { schema: child1.schema })
    await workers.hook('finalizer/' + child1.id)
    const child2 = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    child2.schema[0]['x-capabilities'] = { text: false, insensitive: false }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })
    await workers.hook('finalizer/' + child2.id)

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [child1.id, child2.id]
      },
      schema: [{ key: 'id' }]
    })

    let virtualDataset = await workers.hook('finalizer/' + res.data.id)
    assert.deepEqual(virtualDataset.schema[0]['x-capabilities'], { text: false, insensitive: false, values: false })

    child1.schema[0]['x-capabilities'] = { values: false }
    await ax.patch('/api/v1/datasets/' + child1.id, { schema: child1.schema })
    virtualDataset = await workers.hook('finalizer/' + virtualDataset.id)
    child2.schema[0]['x-capabilities'] = { insensitive: false }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })
    virtualDataset = await workers.hook('finalizer/' + virtualDataset.id)
    assert.deepEqual(virtualDataset.schema[0]['x-capabilities'], { insensitive: false, values: false })
  })
})
