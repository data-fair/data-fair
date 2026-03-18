import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import moment from 'moment'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, restCollectionCount, lsAttachments } from '../../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const hlalonde3 = await axiosAuth('hlalonde3@desdev.cn')
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const superadminPersonal = await axiosAuth('superadmin@test.com', 'superpasswd')

test.describe('REST datasets - History', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Use the history mode', async () => {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthist', {
      isRest: true,
      title: 'resthist',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/resthist/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    await waitForFinalize(ax, 'resthist')
    res = await ax.patch('/api/v1/datasets/resthist/lines/id1', { attr1: 'test2' })
    await waitForFinalize(ax, 'resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    // paginate in history
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions', { params: { size: 1 } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.next)
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.next)
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test1')
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.length, 0)
    assert.ok(!res.data.next)

    // revisions collection is part of storage consumption
    res = await ax.get('/api/v1/stats')
    const storageSize = res.data.limits.store_bytes.consumption
    assert.ok(storageSize > 280)
    res = await ax.get('/api/v1/datasets/resthist')
    assert.equal(res.data.storage.size, storageSize)
    assert.ok(res.data.storage.collection.size > 80)
    assert.ok(res.data.storage.revisions.size > 160)
    assert.equal(res.data.storage.revisions.size + res.data.storage.collection.size, storageSize)

    // delete a line, its history should still be available
    res = await ax.delete('/api/v1/datasets/resthist/lines/id1')
    await waitForFinalize(ax, 'resthist')
    res = await ax.get('/api/v1/datasets/resthist/lines/id1/revisions')
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'delete')
  })

  test('Store history with at least primary key info', async () => {
    const ax = hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistprimary', {
      isRest: true,
      title: 'resthistprimary',
      rest: { history: true },
      primaryKey: ['attr1', 'attr2'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    const line = (await ax.post('/api/v1/datasets/resthistprimary/lines', { attr1: 'test1', attr2: 'test2' })).data
    assert.ok(line._id)
    await waitForFinalize(ax, 'resthistprimary')

    // delete a line, its history should still be available and contain the primary key info
    res = await ax.delete('/api/v1/datasets/resthistprimary/lines/' + line._id)
    await waitForFinalize(ax, 'resthistprimary')
    res = await ax.get('/api/v1/datasets/resthistprimary/revisions')
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0]._action, 'delete')
    assert.equal(res.data.results[0]._id, line._id)
    assert.equal(res.data.results[0].attr1, 'test1')
    assert.equal(res.data.results[0].attr2, 'test2')
  })

  test('Force _updatedAt value to fill existing history', async () => {
    const ax = superadminPersonal
    const axAdmin = superadmin
    await ax.post('/api/v1/datasets/resthistfill', {
      isRest: true,
      title: 'resthistfill',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }]
    })
    // _updatedAt is normally rejected, accepted only as superadmin
    await assert.rejects(
      ax.post('/api/v1/datasets/resthistfill/lines', { _id: 'id1', attr1: 'test-old', _updatedAt: moment().subtract(1, 'day').toISOString() }),
      (err: any) => err.status === 400)
    const older = moment().subtract(2, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-older', _updatedAt: older })
    await waitForFinalize(ax, 'resthistfill')
    const old = moment().subtract(1, 'day').toISOString()
    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-old', _updatedAt: old })
    await waitForFinalize(ax, 'resthistfill')
    const lines = (await ax.get('/api/v1/datasets/resthistfill/lines')).data.results
    assert.equal(lines.length, 1)
    assert.equal(lines[0]._updatedAt, old)

    await axAdmin.post('/api/v1/datasets/resthistfill/lines',
      { _id: 'id1', attr1: 'test-now' })
    await waitForFinalize(ax, 'resthistfill')
    const newLines = (await ax.get('/api/v1/datasets/resthistfill/lines')).data.results
    assert.equal(newLines.length, 1)
    assert.ok(newLines[0]._updatedAt > old)

    const history = (await ax.get('/api/v1/datasets/resthistfill/lines/id1/revisions')).data.results
    assert.equal(history[2].attr1, 'test-older')
    assert.equal(history[2]._updatedAt, older)
    assert.equal(history[1].attr1, 'test-old')
    assert.equal(history[1]._updatedAt, old)
    assert.equal(history[0].attr1, 'test-now')
  })

  test('Define a TTL on revisions in history', async () => {
    const ax = hlalonde3

    let res = await ax.post('/api/v1/datasets/resthistttl', {
      isRest: true,
      title: 'resthistttl',
      rest: { history: true, historyTTL: { active: true, delay: { value: 2, unit: 'days' } } },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/resthistttl/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    assert.equal(res.data._id, 'id1')
    await waitForFinalize(ax, 'resthistttl')
    res = await ax.patch('/api/v1/datasets/resthistttl/lines/id1', { attr1: 'test2' })
    await waitForFinalize(ax, 'resthistttl')
    res = await ax.get('/api/v1/datasets/resthistttl/lines/id1/revisions')
    assert.equal(res.data.results[0]._id, 'id1')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._id, 'id1')
    assert.equal(res.data.results[1].attr1, 'test1')

    // Verify TTL config is saved on dataset
    const dataset = (await ax.get('/api/v1/datasets/resthistttl')).data
    assert.equal(dataset.rest.historyTTL.active, true)
    assert.equal(dataset.rest.historyTTL.delay.value, 2)
    assert.equal(dataset.rest.historyTTL.delay.unit, 'days')

    // Disable TTL
    res = await ax.patch('/api/v1/datasets/resthistttl', { rest: { ...dataset.rest, historyTTL: { active: false } } })
    await waitForFinalize(ax, 'resthistttl')
    const updatedDataset = (await ax.get('/api/v1/datasets/resthistttl')).data
    assert.equal(updatedDataset.rest.historyTTL.active, false)
  })

  test('Toggle the history mode', async () => {
    const ax = await hlalonde3
    let res = await ax.post('/api/v1/datasets/resthisttoggle', {
      isRest: true,
      title: 'resthisttoggle',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/resthisttoggle/lines', { _id: 'id1', attr1: 'test1', attr2: 'test1' })
    await waitForFinalize(ax, 'resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: true } })
    await waitForFinalize(ax, 'resthisttoggle')
    res = await ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } })
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions.count, 1)

    res = await ax.patch('/api/v1/datasets/resthisttoggle', { rest: { history: false } })
    await waitForFinalize(ax, 'resthisttoggle')
    await assert.rejects(ax.get('/api/v1/datasets/resthisttoggle/lines/id1/revisions', { params: { size: 1 } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/resthisttoggle')
    assert.equal(res.data.storage.revisions, undefined)
  })

  test('Use history mode with attachments', async () => {
    const ax = await hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistattach', {
      isRest: true,
      title: 'resthistattach',
      rest: { history: true },
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attr2', type: 'string' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    // create line with an attachment
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test-it/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 'test1')
    form.append('attr2', 'test1')
    res = await ax.post('/api/v1/datasets/resthistattach/lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const line = res.data
    await waitForFinalize(ax, 'resthistattach')

    // patch a property but do not touch the attachment
    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, { attr1: 'test2' })
    await waitForFinalize(ax, 'resthistattach')

    // patch the attachment
    const form2 = new FormData()
    const attachmentContent2 = fs.readFileSync('./test-it/resources/datasets/files/test.odt')
    form2.append('attachment', attachmentContent2, 'dir1/test.pdf')
    form2.append('attr2', 'test2')
    res = await ax.patch(`/api/v1/datasets/resthistattach/lines/${line._id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    await waitForFinalize(ax, 'resthistattach')

    res = await ax.get(`/api/v1/datasets/resthistattach/lines/${line._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[0].attr2, 'test2')
    assert.equal(res.data.results[1].attr1, 'test2')
    assert.equal(res.data.results[1].attr2, 'test1')
    assert.equal(res.data.results[2].attr1, 'test1')
    assert.equal(res.data.results[2].attr2, 'test1')
    assert.equal(res.data.results[2].attachmentPath, res.data.results[1].attachmentPath)
    assert.notEqual(res.data.results[1].attachmentPath, res.data.results[0].attachmentPath)
    let attachments = await lsAttachments('resthistattach')
    assert.equal(attachments.length, 2)

    // delete the line, the attachments should still be there
    await ax.delete(`/api/v1/datasets/resthistattach/lines/${line._id}`)
    await waitForFinalize(ax, 'resthistattach')

    res = await ax.get(`/api/v1/datasets/resthistattach/lines/${line._id}/revisions`)
    assert.equal(res.data.results.length, 4)
    attachments = await lsAttachments('resthistattach')
    assert.equal(attachments.length, 2)
  })

  test('Apply a TTL on some date-field', async () => {
    const ax = await hlalonde3
    await ax.post('/api/v1/datasets/restttl', {
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
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(3, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(2, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'days').toISOString() })
    await ax.post('/api/v1/datasets/restttl/lines', { attr1: 'test1', attr2: moment().subtract(1, 'hours').toISOString() })
    await waitForFinalize(ax, 'restttl')
    await waitForFinalize(ax, 'restttl')
    const res = await ax.get('/api/v1/datasets/restttl/lines')
    assert.equal(res.data.total, 1)
  })

  test('Applying the exact same data twice in history mode should not duplicate revisions', async () => {
    const ax = await hlalonde3
    let res = await ax.post('/api/v1/datasets/resthistidem', {
      isRest: true,
      title: 'resthistidem',
      rest: { history: true },
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _id: 'line1', attr1: 'test1', attr2: 'test1' },
      { _id: 'line2', attr1: 'test1', attr2: 'test1' }
    ])
    await waitForFinalize(ax, 'resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    // 1 in 2 lines is changed
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    assert.equal(await restCollectionCount('resthistidem', { _needsIndexing: true }), 1)
    await waitForFinalize(ax, 'resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)

    // no line is actually changed
    await ax.post('/api/v1/datasets/resthistidem/_bulk_lines?async=true', [
      { _action: 'patch', _id: 'line1', attr1: 'test2' },
      { _action: 'patch', _id: 'line2', attr1: 'test1' }
    ])
    assert.equal(await restCollectionCount('resthistidem', { _needsIndexing: true }), 0)
    await waitForFinalize(ax, 'resthistidem')
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line1/revisions')
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/resthistidem/lines/line2/revisions')
    assert.equal(res.data.total, 1)
  })

  test('Use drop option to recreate all data and manage history', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/restdrophist', {
      isRest: true,
      title: 'restdrophist',
      primaryKey: ['attr1'],
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }],
      rest: { history: true }
    })

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v1' },
      { attr1: 'test2', attr2: 'v1' },
      { attr1: 'test3', attr2: 'v1' }
    ])
    await waitForFinalize(ax, 'restdrophist')

    const lines = (await ax.get('/api/v1/datasets/restdrophist/lines')).data.results
    const line2 = lines.find((l: any) => l.attr1 === 'test2')
    const line3 = lines.find((l: any) => l.attr1 === 'test3')
    await ax.delete('/api/v1/datasets/restdrophist/lines/' + line3._id)
    await waitForFinalize(ax, 'restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v2' },
      { attr1: 'test2', attr2: 'v2' }
    ])
    await waitForFinalize(ax, 'restdrophist')

    res = await ax.post('/api/v1/datasets/restdrophist/_bulk_lines', [
      { attr1: 'test1', attr2: 'v3' },
      { attr1: 'test3', attr2: 'v2' },
      { attr1: 'test4', attr2: 'v1' }
    ], { params: { drop: true } })
    assert.equal(res.data.nbCreated, 3)
    assert.equal(res.data.dropped, true)
    await waitForFinalize(ax, 'restdrophist')
    res = await ax.get('/api/v1/datasets/restdrophist')
    assert.equal(res.data.count, 3)

    res = await ax.get(`/api/v1/datasets/restdrophist/lines/${line3._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'createOrUpdate')
    assert.equal(res.data.results[0].attr2, 'v2')
    assert.equal(res.data.results[1]._action, 'delete')
    assert.equal(res.data.results[2]._action, 'createOrUpdate')
    assert.equal(res.data.results[2].attr2, 'v1')

    res = await ax.get(`/api/v1/datasets/restdrophist/lines/${line2._id}/revisions`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0]._action, 'delete')
    assert.equal(res.data.results[0].attr1, 'test2')
    assert.equal(res.data.results[1]._action, 'createOrUpdate')
    assert.equal(res.data.results[1].attr2, 'v2')
    assert.equal(res.data.results[2]._action, 'createOrUpdate')
    assert.equal(res.data.results[2].attr2, 'v1')
  })
})
