import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')

test.describe('virtual datasets core', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Create an empty virtual dataset', async () => {
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  test('Create a new virtual dataset with predefined id', async () => {
    const ax = testUser1
    const res = await ax.put('/api/v1/datasets/my-id', { isVirtual: true, title: 'a virtual dataset' })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  test('Create a virtual dataset with a child and query', async () => {
    // Send basic dataset
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [dataset.id]
      },
      title: 'a virtual dataset'
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  test('Create a virtual dataset with initFrom', async () => {
    // Send basic dataset
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.patch('/api/v1/datasets/' + dataset.id, { description: 'Description' })
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      initFrom: {
        dataset: dataset.id,
        parts: ['description', 'metadataAttachments']
      },
      virtual: {
        children: [dataset.id]
      },
      title: 'a virtual dataset'
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}`)
    assert.equal(res.data.description, 'Description')
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  test('Create a virtual dataset, add children and query', async () => {
    const ax = testUser1
    const dataset1 = await sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await sendDataset('datasets/dataset1.csv', ax)
    const dataset3 = await sendDataset('datasets/dataset1.csv', ax)
    // last one is not a child, it should not be used
    await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data
    await waitForDatasetError(ax, virtualDataset.id)

    await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      virtual: {
        children: [dataset1.id, dataset2.id, dataset3.id]
      },
      schema: [{
        key: 'id'
      }]
    })
    virtualDataset = await waitForFinalize(ax, virtualDataset.id)
    assert.equal(virtualDataset.count, 6)
    assert.equal(virtualDataset.dataUpdatedAt, dataset3.dataUpdatedAt)
    assert.deepEqual(virtualDataset.dataUpdatedBy, dataset3.dataUpdatedBy)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/api-docs.json`)
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
    res = await ax.post('/api/v1/_check-api', res.data)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.total, 6)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
    assert.equal(res.data.total, 3)
  })

  test('Check compatibility of schema with children', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
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
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.ok(virtualDataset.schema.find((f: any) => f.key === 'id'))
    assert.ok(virtualDataset.schema.find((f: any) => f.key === 'id').type === 'string')
    res = await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      schema: [{
        key: 'badKey'
      }]
    })
    assert.ok(res.data.schema.find((f: any) => f.key === 'badKey'))
  })

  test('Compatibility is accepted for integer/number types', async () => {
    const ax = testUser1
    const datasetNum = await sendDataset('datasets/dataset-number.csv', ax)
    let datasetInt = await sendDataset('datasets/dataset-integer.csv', ax)
    assert.equal(datasetInt.schema.find((p: any) => p.key === 'num').type, 'integer')
    await assert.rejects(ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [datasetNum.id, datasetInt.id]
      },
      schema: [{ key: 'str' }, { key: 'num' }]
    }), (err: any) => {
      assert.equal(err.status, 400)
      return true
    })

    datasetInt.schema.find((p: any) => p.key === 'num')['x-transform'] = { type: 'number' }
    await ax.patch('/api/v1/datasets/' + datasetInt.id, {
      schema: datasetInt.schema
    })
    datasetInt = await waitForFinalize(ax, datasetInt.id)
    assert.equal(datasetInt.schema.find((p: any) => p.key === 'num').type, 'number')

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [datasetNum.id, datasetInt.id]
      },
      schema: [{ key: 'str' }, { key: 'num' }]
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.equal(virtualDataset.schema.find((p: any) => p.key === 'num').type, 'number')
  })

  test('Check that column restriction is enforced (select, search, aggs)', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
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
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.ok(!virtualDataset.schema.find((f: any) => f.key === 'id'))

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { q: 'koumoul' } })
    assert.equal(res.data.total, 0, 'cannot match on a field not from the schema')
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'koumoul' } })
    assert.equal(res.data.total, 0, 'cannot match on a field not from the schema')

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'id:koumoul' } }),
      { status: 400 }
    )

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: 'test AND (id:koumoul OR test)' } }),
      { status: 400 }
    )

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:adr' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { qs: '_exists_:id' } }),
      { status: 400 }
    )

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { sort: 'koumoul' } }),
      { status: 400 }
    )

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`, { params: { select: 'id,adr' } }),
      { status: 400 }
    )

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/values_agg`, { params: { field: 'id' } }),
      { status: 400 }
    )
  })

  test('Apply static filter', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
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
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.ok(!virtualDataset.schema.find((f: any) => f.key === 'id'))

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].adr, '19 rue de la voie lactée saint avé')

    // applying another filter should trigger re-finalization
    await ax.patch('/api/v1/datasets/' + virtualDataset.id, {
      virtual: {
        children: [dataset.id],
        filters: [{
          key: 'id',
          values: ['bidule']
        }]
      }
    })

    const newVirtualDataset = await waitForFinalize(ax, virtualDataset.id)
    assert.ok(newVirtualDataset.finalizedAt, virtualDataset.finalizedAt)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].adr, 'adresse inconnue')
  })

  test('Add another virtual dataset as child', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
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
    const virtualDataset = await waitForFinalize(ax, res.data.id)

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
    const virtualDataset2 = await waitForFinalize(ax, res.data.id)

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
    const virtualDataset3 = await waitForFinalize(ax, res.data.id)

    res = await ax.get(`/api/v1/datasets/${virtualDataset3.id}/lines`)
    assert.equal(res.data.total, 2, 'return matching line')
  })

  test('A virtual dataset without physical children cannot be queried', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: []
      }
    })
    await waitForDatasetError(ax, res.data.id)

    res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [res.data.id]
      }
    })
    await waitForDatasetError(ax, res.data.id)

    await assert.rejects(ax.get(`/api/v1/datasets/${res.data.id}/lines`), (err: any) => {
      assert.equal(err.status, 501)
      // the body is the user-facing message, not empty and not a stack trace
      assert.equal(err.data, 'Le jeu de données virtuel ne peut pas être requêté, il n\'utilise aucun jeu de données requêtable.')
      return true
    })
  })

  test('A virtual dataset can have a child virtual dataset with filters', async () => {
    const ax = testUser1
    // the ODS compat API is opt-in per dataset owner (brief's snippet omitted this: without it
    // the compat-ods route 404s with "unknown API" regardless of our filter-threading changes)
    await ax.put('/api/v1/settings/user/test_user1', { compatODS: true })
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'filtered child',
      virtual: {
        children: [dataset.id],
        filters: [{ key: 'id', values: ['koumoul'] }]
      },
      schema: [{ key: 'id' }, { key: 'adr' }]
    })
    const child = await waitForFinalize(ax, res.data.id)

    res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual grandparent',
      virtual: { children: [child.id] },
      schema: [{ key: 'id' }, { key: 'adr' }]
    })
    const parent = await waitForFinalize(ax, res.data.id)
    // the finalized count respects the child's filters
    assert.equal(parent.count, 1)

    // native lines API
    res = await ax.get(`/api/v1/datasets/${parent.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'koumoul')

    // aggregations
    res = await ax.get(`/api/v1/datasets/${parent.id}/values_agg`, { params: { field: 'id' } })
    assert.equal(res.data.aggs.length, 1)
    assert.equal(res.data.aggs[0].value, 'koumoul')

    // ODS compat API
    res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${parent.id}/records`)
    assert.equal(res.data.total_count, 1)
    assert.equal(res.data.results[0].id, 'koumoul')

    // the parent's own filters compose (AND) with the child's filters
    await ax.patch('/api/v1/datasets/' + parent.id, {
      virtual: { children: [child.id], filters: [{ key: 'id', values: ['bidule'] }] }
    })
    await waitForFinalize(ax, parent.id)
    res = await ax.get(`/api/v1/datasets/${parent.id}/lines`)
    assert.equal(res.data.total, 0)
  })

  test('Union of a filtered and an unfiltered virtual child over the same descendant', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const filteredChild = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'filtered child',
      virtual: { children: [dataset.id], filters: [{ key: 'id', values: ['koumoul'] }] },
      schema: [{ key: 'id' }, { key: 'adr' }]
    })).data
    await waitForFinalize(ax, filteredChild.id)
    const plainChild = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'plain child',
      virtual: { children: [dataset.id] },
      schema: [{ key: 'id' }, { key: 'adr' }]
    })).data
    await waitForFinalize(ax, plainChild.id)

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual parent',
      virtual: { children: [filteredChild.id, plainChild.id] },
      schema: [{ key: 'id' }, { key: 'adr' }]
    })
    const parent = await waitForFinalize(ax, res.data.id)
    // the descendant index is queried once: rows admitted by the unfiltered path, no duplicates
    const lines = await ax.get(`/api/v1/datasets/${parent.id}/lines`)
    assert.equal(lines.data.total, 2)
  })

  test('Filters of nested virtual ancestors are merged', async () => {
    // dataset2.csv has 6 rows: 3 with id=koumoul, 2 with id=bidule, 1 with an empty id.
    // level1's filter (in [koumoul, bidule]) excludes the empty-id row (-> 5 rows).
    // level2's filter (nin [bidule]) further excludes the 2 bidule rows (-> 3 rows).
    // both filters are load-bearing here: dropping level1 would yield 4 (3 koumoul + empty-id row),
    // dropping level2 would yield 5 (3 koumoul + 2 bidule) — unlike dataset1.csv (2 rows total),
    // which cannot distinguish "both filters applied" from "only one applied".
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset2.csv', ax)
    const level1 = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'level1',
      virtual: { children: [dataset.id], filters: [{ key: 'id', values: ['koumoul', 'bidule'] }] },
      schema: [{ key: 'id' }, { key: 'employees' }]
    })).data
    await waitForFinalize(ax, level1.id)
    const level2 = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'level2',
      virtual: { children: [level1.id], filters: [{ key: 'id', operator: 'nin', values: ['bidule'] }] },
      schema: [{ key: 'id' }, { key: 'employees' }]
    })).data
    await waitForFinalize(ax, level2.id)

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'level3',
      virtual: { children: [level2.id] },
      schema: [{ key: 'id' }, { key: 'employees' }]
    })
    const parent = await waitForFinalize(ax, res.data.id)
    const lines = await ax.get(`/api/v1/datasets/${parent.id}/lines`)
    assert.equal(lines.data.total, 3)
    assert.ok(lines.data.results.every((r: any) => r.id === 'koumoul'), JSON.stringify(lines.data.results))
  })

  test('A virtual dataset cannot have a child virtual dataset with filterActiveAccount', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets/restaccountchild', {
      isRest: true,
      title: 'restaccountchild',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'account', type: 'string', 'x-refersTo': 'https://github.com/data-fair/lib/account' }]
    })).data
    await ax.post('/api/v1/datasets/restaccountchild/_bulk_lines', [{ attr1: 'test1', account: 'user:test_user2' }])
    await waitForFinalize(ax, dataset.id)

    const child = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'account filtered child',
      virtual: { children: [dataset.id], filterActiveAccount: true },
      schema: [{ key: 'attr1' }, { key: 'account' }]
    })).data
    await waitForFinalize(ax, child.id)

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual parent',
      virtual: { children: [child.id] },
      schema: [{ key: 'attr1' }]
    })
    await waitForDatasetError(ax, res.data.id)
    await assert.rejects(ax.get(`/api/v1/datasets/${res.data.id}/lines`), (err: any) => {
      assert.equal(err.status, 501)
      assert.ok(err.data.includes('filtre sur le compte actif'), err.data)
      return true
    })
  })

  test('A virtual dataset is updated after a child schema changes', async () => {
    // Send basic dataset
    const ax = testUser1
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [dataset.id] },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    const virtualDataset = res.data
    await waitForFinalize(ax, virtualDataset.id)

    let dateField = dataset.schema.find((f: any) => f.key === 'some_date')
    let virtualDateField = virtualDataset.schema.find((f: any) => f.key === 'some_date')
    assert.equal(virtualDateField.format, 'date')

    dateField['x-transform'] = { type: 'string' }
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    dataset = await waitForFinalize(ax, dataset.id)
    dateField = dataset.schema.find((f: any) => f.key === 'some_date')
    assert.equal(dateField.format, undefined)

    virtualDateField = await waitForFinalize(ax, virtualDataset.id)
    virtualDateField = virtualDataset.schema.find((f: any) => f.key === 'some_date')

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  test('A virtual dataset is updated after a child schema changes (2)', async () => {
    const ax = testUser1
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [dataset.id] },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data
    await waitForFinalize(ax, virtualDataset.id)

    let dateField = dataset.schema.find((f: any) => f.key === 'some_date')
    let virtualDateField = virtualDataset.schema.find((f: any) => f.key === 'some_date')
    assert.equal(virtualDateField.format, 'date')

    dateField['x-transform'] = { type: 'string' }
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    dataset = await waitForFinalize(ax, dataset.id)
    dateField = dataset.schema.find((f: any) => f.key === 'some_date')
    assert.equal(dateField.format, undefined)

    virtualDataset = await waitForFinalize(ax, virtualDataset.id)
    virtualDateField = virtualDataset.schema.find((f: any) => f.key === 'some_date')
    assert.equal(virtualDateField.format, undefined)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
  })

  test('A virtual dataset is in error if children become inconsistent', async () => {
    // Send basic dataset
    const ax = testUser1
    const dataset1 = await sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [dataset1.id, dataset2.id] },
      schema: [{ key: 'some_date' }],
      title: 'a virtual dataset'
    })
    let virtualDataset = res.data
    await waitForFinalize(ax, virtualDataset.id)

    const dateField = dataset1.schema.find((f: any) => f.key === 'some_date')
    dateField['x-transform'] = { type: 'string' }
    res = await ax.patch('/api/v1/datasets/' + dataset1.id, { schema: dataset1.schema })
    await waitForFinalize(ax, dataset1.id)

    await waitForDatasetError(ax, virtualDataset.id)
    const journal = (await ax.get('/api/v1/datasets/' + virtualDataset.id + '/journal')).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('Le champ "some_date" a des formats contradictoires (non défini, date).'))
    virtualDataset = (await ax.get('/api/v1/datasets/' + virtualDataset.id)).data
    assert.equal(virtualDataset.status, 'error')
    assert.ok(!virtualDataset.errorRetry)
  })

  test('A virtual dataset cannot have a private child from another owner', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    const res = await testUser3.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    await waitForDatasetError(testUser3, res.data.id)

    await assert.rejects(testUser3.get(`/api/v1/datasets/${res.data.id}/lines`), (err: any) => {
      assert.equal(err.status, 501)
      // the error now pinpoints the exact child dataset that is not readable
      assert.ok(err.data.includes(dataset.id))
      assert.ok(err.data.includes('n\'est pas accessible en lecture par le compte propriétaire du jeu de données virtuel'))
      // the body is the user-facing message, not a stack trace with the worker-only [noretry] prefix
      assert.ok(err.data.startsWith(`Le jeu de données virtuel "${res.data.id}" ne peut pas être requêté`), err.data)
      return true
    })
  })

  test('A virtual dataset can have a public child from another owner', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'] }
    ])

    const res = await testUser3.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(testUser3, res.data.id)

    await testUser3.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })

  test('A user\'s virtual dataset can have a child from another owner with specific permissions', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'], type: 'user', id: 'test_user3' }
    ])

    const res = await testUser3.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(testUser3, res.data.id)

    await testUser3.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })

  test('A user\'s virtual dataset can have a private child from another owner if an intermediate virtual dataset provides permissions', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    const res1 = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset1 = await waitForFinalize(ax, res1.data.id)
    await ax.put('/api/v1/datasets/' + virtualDataset1.id + '/permissions', [
      { classes: ['read'], type: 'user', id: 'test_user3' }
    ])

    const res2 = await testUser3.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [virtualDataset1.id]
      }
    })
    const virtualDataset2 = await waitForFinalize(testUser3, res2.data.id)

    await testUser3.get(`/api/v1/datasets/${virtualDataset2.id}/lines`)
  })

  test('An org\'s virtual dataset can have a child from another owner with specific permissions', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'], type: 'organization', id: 'test_org1' }
    ])

    const res = await testUser4Org.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(testUser4Org, res.data.id)

    await testUser4Org.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })
})
