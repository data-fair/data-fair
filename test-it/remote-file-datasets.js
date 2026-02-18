import { strict as assert } from 'node:assert'
import * as workers from '../api/src/workers/index.ts'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, formHeaders } from './utils/index.ts'
import mongo from '../api/src/mongo.ts'

describe('datasets based on remote files', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('manage failure to fetch file', async function () {
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://localhost:5600/notafile' } })
    const dataset = res.data
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err) => {
      assert.ok(err.message.includes('404 - Not Found'))
      return true
    })
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.ok(journal[0].data.includes('404 - Not Found'))
  })

  it('manage fetching a file in unsupported format', async function () {
    const ax = dmeadus
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.ppt', reply: { status: 200, body: 'fake ppt' } }, { name: 'setNock' })

    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://test-remote.com/data.ppt' } })
    const dataset = res.data
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err) => {
      assert.ok(err.message.includes('Le format de ce fichier n\'est pas supporté'))
      return true
    })
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.ok(journal[0].data.includes('Le format de ce fichier n\'est pas supporté'))
  })

  it('manage fetching a geojson with json mime type', async function () {
    const ax = dmeadus
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.geojson', reply: { status: 200, body: '{"type":"FeatureCollection","features": [{}]}' } }, { name: 'setNock' })
    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://test-remote.com/data.geojson' } })
    let dataset = res.data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'data.geojson')
    assert.equal(dataset.file.name, 'data.geojson')
    assert.equal(dataset.count, 1)
  })

  it('fetch a file and create a dataset', async function () {
    const ax = dmeadus
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.csv', reply: { status: 200, body: 'col\nval1\nval2' } }, { name: 'setNock' })
    const res = await ax.post('/api/v1/datasets', {
      remoteFile: { url: 'http://test-remote.com/data.csv', autoUpdate: { active: true } }
    })
    let dataset = res.data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.title, 'data')
    assert.equal(dataset.originalFile.name, 'data.csv')
    assert.equal(dataset.file.name, 'data.csv')
    assert.equal(dataset.count, 2)
    assert.ok(dataset.schema.find(p => p.key === 'col'))
    assert.equal(dataset.originalFile.name, 'data.csv')
    assert.ok(dataset.dataUpdatedAt)
    assert.equal(dataset.dataUpdatedAt, dataset.remoteFile.autoUpdate.lastUpdate)

    // force change of nextExport date to trigger worker
    // but md5 did not change
    const nextUpdate = new Date().toISOString()
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.csv', reply: { status: 200, body: 'col\nval1\nval2' } }, { name: 'setNock' })
    await mongo.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    dataset = await workers.hook('downloadFile/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.ok(dataset.remoteFile.autoUpdate.nextUpdate > nextUpdate)

    // trigger re-downloading but etag matches did not change
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.csv', reply: { status: 304 } }, { name: 'setNock' })
    await mongo.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    dataset = await workers.hook('downloadFile/' + dataset.id)
    assert.ok(!dataset.draft)
    assert.equal(dataset.status, 'finalized')
    assert.ok(dataset.remoteFile.autoUpdate.nextUpdate > nextUpdate)

    // trigger re-downloading and content changed
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data.csv', reply: { status: 200, body: 'col\nval11\nval22' } }, { name: 'setNock' })
    await mongo.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.ok(dataset.remoteFile.autoUpdate.nextUpdate > nextUpdate)

    // trigger re-downloading and file name changed
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data2.csv', reply: { status: 200, body: 'col\nval11\nval22' } }, { name: 'setNock' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { remoteFile: { url: 'http://test-remote.com/data2.csv' } })
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'data2.csv')

    // trigger re-downloading and file name is specifid by content-disposition header
    await workers.workers.filesManager.run({ origin: 'http://test-remote.com', method: 'get', path: '/data3.csv', reply: { status: 200, body: 'col\nval11\nval22', headers: { 'content-disposition': 'attachment; filename="remote-data.csv"' } } }, { name: 'setNock' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { remoteFile: { url: 'http://test-remote.com/data3.csv' } })
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'remote-data.csv')
  })
})
