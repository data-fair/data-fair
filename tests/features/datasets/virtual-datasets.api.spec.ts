import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const cdurning2 = await axiosAuth('cdurning2@desdev.cn')
const hlalonde3 = await axiosAuth('hlalonde3@desdev.cn')
const hlalonde3Org = await axiosAuth('hlalonde3@desdev.cn', 'passwd', 'KWqAGZ4mG')
const ngernier4 = await axiosAuth('ngernier4@usa.gov')

test.describe('virtual datasets', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Create an empty virtual dataset', async () => {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  test('Create a new virtual dataset with predefined id', async () => {
    const ax = dmeadus
    const res = await ax.put('/api/v1/datasets/my-id', { isVirtual: true, title: 'a virtual dataset' })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-virtual-dataset')
  })

  test('Create a virtual dataset with a child and query', async () => {
    // Send basic dataset
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
      return true
    })
  })

  test('A virtual dataset cannot have a child virtual dataset with filters (no way to enforce them)', async () => {
    const ax = dmeadus
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
    await waitForFinalize(ax, res.data.id)

    res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [res.data.id]
      }
    })
    const virtualDataset = res.data
    await waitForDatasetError(ax, virtualDataset.id)

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`),
      { status: 501 }
    )
  })

  test('A virtual dataset is updated after a child schema changes', async () => {
    // Send basic dataset
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
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
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    const res = await cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    await waitForDatasetError(cdurning2, res.data.id)

    await assert.rejects(cdurning2.get(`/api/v1/datasets/${res.data.id}/lines`), (err: any) => {
      assert.equal(err.status, 501)
      assert.ok(err.data.includes('il utilise un jeu de données pour lequel ce compte n\'a pas de permission de lecture'))
      return true
    })
  })

  test('A virtual dataset can have a public child from another owner', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'] }
    ])

    const res = await cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(cdurning2, res.data.id)

    await cdurning2.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })

  test('A user\'s virtual dataset can have a child from another owner with specific permissions', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'], type: 'user', id: 'cdurning2' }
    ])

    const res = await cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(cdurning2, res.data.id)

    await cdurning2.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })

  test('A user\'s virtual dataset can have a private child from another owner if an intermediate virtual dataset provides permissions', async () => {
    const ax = dmeadus
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
      { classes: ['read'], type: 'user', id: 'cdurning2' }
    ])

    const res2 = await cdurning2.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [virtualDataset1.id]
      }
    })
    const virtualDataset2 = await waitForFinalize(cdurning2, res2.data.id)

    await cdurning2.get(`/api/v1/datasets/${virtualDataset2.id}/lines`)
  })

  test('An org\'s virtual dataset can have a child from another owner with specific permissions', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'], type: 'organization', id: 'KWqAGZ4mG' }
    ])

    const res = await hlalonde3Org.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      }
    })
    const virtualDataset = await waitForFinalize(hlalonde3Org, res.data.id)

    await hlalonde3Org.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
  })

  test('A virtual dataset has the most restrictive capabilities of its children', async () => {
    const ax = dmeadus
    const child1 = await sendDataset('datasets/dataset1.csv', ax)
    child1.schema[0]['x-capabilities'] = { text: false, values: false }
    await ax.patch('/api/v1/datasets/' + child1.id, { schema: child1.schema })
    await waitForFinalize(ax, child1.id)
    const child2 = await sendDataset('datasets/dataset1.csv', ax)
    child2.schema[0]['x-capabilities'] = { text: false, insensitive: false }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })
    await waitForFinalize(ax, child2.id)

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [child1.id, child2.id]
      },
      schema: [{ key: 'id' }]
    })

    let virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.deepEqual(virtualDataset.schema[0]['x-capabilities'], { text: false, insensitive: false, values: false })

    child1.schema[0]['x-capabilities'] = { values: false }
    await ax.patch('/api/v1/datasets/' + child1.id, { schema: child1.schema })
    virtualDataset = await waitForFinalize(ax, virtualDataset.id)
    child2.schema[0]['x-capabilities'] = { insensitive: false }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })
    virtualDataset = await waitForFinalize(ax, virtualDataset.id)
    assert.deepEqual(virtualDataset.schema[0]['x-capabilities'], { insensitive: false, values: false })
  })

  test('A virtual dataset has a merge of the labels of its children', async () => {
    const ax = dmeadus
    const child1 = await sendDataset('datasets/dataset1.csv', ax)
    child1.schema[0]['x-labels'] = { koumoul: 'Koumoul' }
    await ax.patch('/api/v1/datasets/' + child1.id, { schema: child1.schema })
    const child2 = await sendDataset('datasets/dataset1.csv', ax)
    child2.schema[0]['x-labels'] = { bidule: 'Bidule' }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [child1.id, child2.id]
      },
      schema: [{ key: 'id' }]
    })

    let virtualDataset = await waitForFinalize(ax, res.data.id)
    assert.deepEqual(virtualDataset.schema[0]['x-labels'], { koumoul: 'Koumoul', bidule: 'Bidule' })

    child2.schema[0]['x-labels'] = { bidule: 'BiBidule' }
    await ax.patch('/api/v1/datasets/' + child2.id, { schema: child2.schema })
    virtualDataset = (await ax.get(`/api/v1/datasets/${virtualDataset.id}`)).data
    assert.deepEqual(virtualDataset.schema[0]['x-labels'], { koumoul: 'Koumoul', bidule: 'BiBidule' })
  })

  test('A virtual dataset of a geo parent can serve tiles', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    // Update schema to specify geo point
    const locProp = dataset.schema.find((p: any) => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    let res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7`)
    assert.equal(res.data.total, 1)

    const virtual1 = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [dataset.id]
      },
      schema: [{ key: 'id' }, { key: 'loc' }]
    })).data
    await waitForFinalize(ax, virtual1.id)

    res = await ax.get(`/api/v1/datasets/${virtual1.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${virtual1.id}/lines?xyz=63,44,7`)
    assert.equal(res.data.total, 1)

    const virtual2 = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: {
        children: [virtual1.id],
        filters: [{
          key: 'id',
          values: ['koumoul']
        }]
      },
      schema: [{ key: 'id' }, { key: 'loc' }]
    })).data
    await waitForFinalize(ax, virtual2.id)

    res = await ax.get(`/api/v1/datasets/${virtual2.id}/lines`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${virtual2.id}/lines?xyz=63,44,7`)
    assert.equal(res.data.total, 1)
  })

  test('Create a virtual dataset with a filter on account concept', async () => {
    const ax = dmeadus

    const dataset = (await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'restaccount',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'account', type: 'string', 'x-refersTo': 'https://github.com/data-fair/lib/account' }]
    })).data
    const lines = [
      { attr1: 'test1', account: 'user:ccherryholme1' },
      { attr1: 'test2', account: 'user:cdurning2' },
      { attr1: 'test3', account: 'user:cdurning2' },
      { attr1: 'test4' },
      { attr1: 'test5', account: 'organization:KWqAGZ4mG:dep1' },
      { attr1: 'test6', account: 'user:hlalonde3' }
    ]
    await ax.post('/api/v1/datasets/rest1/_bulk_lines', lines)
    await waitForFinalize(ax, dataset.id)

    let res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [dataset.id],
        filterActiveAccount: true
      },
      title: 'a virtual dataset',
      schema: [{ key: 'attr1' }, { key: 'account' }]
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    await ax.put('/api/v1/datasets/' + virtualDataset.id + '/permissions', [
      { classes: ['read'] }
    ])

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, lines.length)
    assert.ok(res.headers['cache-control'].includes('private'))

    // owner of dataset can use account filter both on virtual dataset and on child
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user%3Acdurning2`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?account=user%3Acdurning2`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)

    // user can read the lines where he is referenced
    res = await cdurning2.get(`/api/v1/datasets/${virtualDataset.id}/lines?size=1`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[0].account, 'user:cdurning2')
    assert.ok(res.headers['cache-control'].includes('private'))
    assert.ok(res.data.next)
    assert.ok(res.data.next.includes('account=user%3Acdurning2'))
    res = await cdurning2.get(res.data.next)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].attr1, 'test3')
    assert.equal(res.data.results[0].account, 'user:cdurning2')

    // another user cannot read the lines where he is not referenced
    res = await ngernier4.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 0)
    await assert.rejects(
      ngernier4.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user%3Acdurning2`),
      { status: 403 }
    )

    // another user can read the line where is current orga is referenced and those where he is personnally reference
    res = await hlalonde3.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await hlalonde3Org.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await hlalonde3Org.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user:hlalonde3`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    res = await hlalonde3Org.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=organization:KWqAGZ4mG:dep1`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
  })

  test('a virtual dataset of a dataset with attachments re-expose those attachments', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'childattach',
      attachmentsAsImage: true,
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const child = res.data

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test-it/resources/avatar.jpeg')
    form.append('attachment', attachmentContent, 'dir1/avatar.jpeg')
    form.append('attr1', '10')
    res = await ax.post(`/api/v1/datasets/${child.id}/lines`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/avatar.jpeg'))
    await waitForFinalize(ax, child.id)
    const lines = (await ax.get(`/api/v1/datasets/${child.id}/lines`)).data.results
    assert.equal(lines.length, 1)
    const attachmentPath = lines[0].attachmentPath
    res = await ax.get(`/api/v1/datasets/${child.id}/attachments/${attachmentPath}`)
    assert.equal(res.status, 200)

    res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: {
        children: [child.id],
        filterActiveAccount: true
      },
      attachmentsAsImage: true,
      title: 'a virtual dataset',
      schema: [{ key: 'attr1' }]
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/attachments/badid/dir1/avatar.jpeg`),
      { data: 'Child dataset not found' }
    )

    await assert.rejects(
      ax.get(`/api/v1/datasets/${virtualDataset.id}/attachments/${child.id}/${attachmentPath}`),
      { data: 'No attachment column found' }
    )

    await ax.patch(`/api/v1/datasets/${virtualDataset.id}`, {
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    await waitForFinalize(ax, res.data.id)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/attachments/${child.id}/${attachmentPath}`)
    assert.equal(res.status, 200)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.data.results[0]._attachment_url, `${config.publicUrl}/api/v1/datasets/${virtualDataset.id}/attachments/${child.id}/${attachmentPath}`)

    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines?thumbnail=true`)
    assert.ok(res.data.results[0]._thumbnail)
    res = await ax.get(res.data.results[0]._thumbnail)
    assert.equal(res.status, 200)
  })

  test('fails to upload file on virtual data', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'child',
      schema: [{ key: 'attr1', type: 'integer' },]
    })
    const child = res.data
    res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [child.id] },
      title: 'a virtual dataset'
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    const form = new FormData()
    form.append('file', 'test', 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + virtualDataset.id, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)
  })
})
