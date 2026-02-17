import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, dmeadusOrg, anonymous, alone, sendDataset, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')

describe('datasets', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get datasets when not authenticated', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets when authenticated', async function () {
    const ax = alone
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Search and apply some params (facets, raw, count, select, etc)', async function () {
    const ax = dmeadus
    const axOrg = dmeadusOrg

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 0)
    assert.equal(res.data.sums.count, 0)
    assert.equal(res.data.facets.owner.length, 0)
    assert.equal(res.data.facets['field-type'].length, 0)

    await sendDataset('datasets/dataset1.csv', ax)
    await sendDataset('datasets/dataset1.csv', axOrg)
    await sendDataset('datasets/dataset1.csv', axOrg)

    res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.facets.owner.length, 1)
    assert.equal(res.data.facets.owner[0].count, 1)
    assert.equal(res.data.facets.owner[0].value.id, 'dmeadus0')
    assert.equal(res.data.facets.owner[0].value.type, 'user')
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 1)
    assert.equal(res.data.sums.count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 3)
    assert.equal(res.data.facets.owner.length, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.owner.length, 2)
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
    assert.equal(res.data.facets.owner[0].value.type, 'organization')
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 2)
    assert.equal(res.data.sums.count, 4)

    res = await axOrg.get('/api/v1/datasets', { params: { count: false } })
    assert.equal(res.data.count, undefined)

    res = await axOrg.get('/api/v1/datasets', { params: { raw: true, select: 'count', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.equal(res.data.results[0].owner, undefined)
    assert.equal(res.data.results[0].count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, { id: 'KWqAGZ4mG', name: 'Fivechat', type: 'organization' })
    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions,-owner', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, undefined)
  })

  it('Failure to upload dataset exceeding limit', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', Buffer.alloc(160000), 'largedataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 413)
  })

  it('Failure to upload multiple datasets exceeding limit', async function () {
    const ax = dmeadus
    let form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    await assert.rejects(workers.hook('finalize/' + res.data.id))

    form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset2.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 429)
  })

  it('Upload new dataset in user zone', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'dmeadus0')
    assert.equal(res.data.previews.length, 1)
    assert.equal(res.data.previews[0].id, 'table')
    assert.equal(res.data.previews[0].title, 'Tableau')
    assert.ok(res.data.previews[0].href.endsWith(`/embed/dataset/${res.data.id}/table`))
    assert.equal(res.data.updatedAt, res.data.createdAt)
    assert.equal(res.data.updatedAt, res.data.dataUpdatedAt)
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.file.encoding, 'UTF-8')
    assert.equal(dataset.count, 2)
  })

  it('Upload new dataset in user zone with title', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('title', "My title'")
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'my-title')
    assert.equal(res.data.title, "My title'")
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset with utf8 filename', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, '1-Réponse N° 1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, '1-reponse-n-1')
    assert.equal(res.data.title, '1 Réponse N° 1')
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset in organization zone', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset in organization zone with explicit department', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    form.append('body', JSON.stringify({ owner: { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat', department: 'dep1' } }))
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    assert.equal(res.data.owner.department, 'dep1')
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Uploading same file twice should increment slug', async function () {
    const ax = dmeadusOrg
    for (const i of [1, 2, 3]) {
      const form = new FormData()
      form.append('file', datasetFd, 'my-dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
      assert.equal(res.status, 201)
      assert.equal(res.data.slug, 'my-dataset' + (i === 1 ? '' : '-' + i))
      const workers = await import('../api/src/workers/index.ts')
      await workers.hook('finalize/' + res.data.id)
    }
  })
})
