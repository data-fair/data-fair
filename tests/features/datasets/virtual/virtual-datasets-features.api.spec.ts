import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks, config } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')
const testUser4 = await axiosAuth('test_user4@test.com')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')
const testUser5 = await axiosAuth('test_user5@test.com')

test.describe('virtual datasets features', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('A virtual dataset has the most restrictive capabilities of its children', async () => {
    const ax = testUser1
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
    const ax = testUser1
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
    const ax = testUser1
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
    const ax = testUser1

    const dataset = (await ax.post('/api/v1/datasets/rest1', {
      isRest: true,
      title: 'restaccount',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'account', type: 'string', 'x-refersTo': 'https://github.com/data-fair/lib/account' }]
    })).data
    const lines = [
      { attr1: 'test1', account: 'user:test_user2' },
      { attr1: 'test2', account: 'user:test_user3' },
      { attr1: 'test3', account: 'user:test_user3' },
      { attr1: 'test4' },
      { attr1: 'test5', account: 'organization:test_org1:dep1' },
      { attr1: 'test6', account: 'user:test_user4' }
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
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user%3Atest_user3`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?account=user%3Atest_user3`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)

    // user can read the lines where he is referenced
    res = await testUser3.get(`/api/v1/datasets/${virtualDataset.id}/lines?size=1`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[0].account, 'user:test_user3')
    assert.ok(res.headers['cache-control'].includes('private'))
    assert.ok(res.data.next)
    assert.ok(res.data.next.includes('account=user%3Atest_user3'))
    res = await testUser3.get(res.data.next)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].attr1, 'test3')
    assert.equal(res.data.results[0].account, 'user:test_user3')

    // another user cannot read the lines where he is not referenced
    res = await testUser5.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 0)
    await assert.rejects(
      testUser5.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user%3Atest_user3`),
      { status: 403 }
    )

    // another user can read the line where is current orga is referenced and those where he is personnally reference
    res = await testUser4.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await testUser4Org.get(`/api/v1/datasets/${virtualDataset.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    res = await testUser4Org.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=user:test_user4`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    res = await testUser4Org.get(`/api/v1/datasets/${virtualDataset.id}/lines?account=organization:test_org1:dep1`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
  })

  test('a virtual dataset of a dataset with attachments re-expose those attachments', async () => {
    const ax = testUser1
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
    const attachmentContent = fs.readFileSync('./tests/resources/avatar.jpeg')
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
    const ax = testUser1
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
