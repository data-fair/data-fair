const assert = require('assert').strict
const nock = require('nock')
const workers = require('../server/workers')

describe('datasets based on remote files', () => {
  it('manage failure to fetch file', async () => {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://localhost:5600/notafile' } })
    const dataset = res.data
    await assert.rejects(workers.hook('finalizer/' + dataset.id), (err) => {
      assert.ok(err.message.includes('404 - Not Found'))
      return true
    })
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.ok(journal[0].data.includes('404 - Not Found'))
  })

  it('manage fetching a file in unsupported format', async () => {
    const ax = global.ax.dmeadus
    const nockScope = nock('http://test-remote.com')
      .get('/data.ppt').reply(200, 'fake ppt')
    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://test-remote.com/data.ppt' } })
    const dataset = res.data
    await assert.rejects(workers.hook('finalizer/' + dataset.id), (err) => {
      assert.ok(err.message.includes('Le format de ce fichier n\'est pas supporté'))
      return true
    })
    nockScope.done()
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.ok(journal[0].data.includes('Le format de ce fichier n\'est pas supporté'))
  })

  it('manage fetching a geojson with json mime type', async () => {
    const ax = global.ax.dmeadus
    const nockScope = nock('http://test-remote.com')
      .get('/data.geojson').reply(200, '{"type":"FeatureCollection","features": []}', { 'content-type': 'application/json' })
    const res = await ax.post('/api/v1/datasets', { remoteFile: { url: 'http://test-remote.com/data.geojson' } })
    let dataset = res.data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'data.geojson')
    assert.equal(dataset.file.name, 'data.geojson')
    assert.equal(dataset.count, 0)
    nockScope.done()
  })

  it('fetch a file and create a dataset', async () => {
    const ax = global.ax.dmeadus
    let nockScope = nock('http://test-remote.com')
      .get('/data.csv').reply(200, 'col\nval1\nval2')
    const res = await ax.post('/api/v1/datasets', {
      remoteFile: { url: 'http://test-remote.com/data.csv', autoUpdate: { active: true } }
    })
    let dataset = res.data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.title, 'data')
    assert.equal(dataset.originalFile.name, 'data.csv')
    assert.equal(dataset.file.name, 'data.csv')
    assert.equal(dataset.count, 2)
    assert.ok(dataset.schema.find(p => p.key === 'col'))
    assert.equal(dataset.originalFile.name, 'data.csv')
    nockScope.done()

    // force change of nextExport date to trigger worker
    // but md5 did not change
    const nextUpdate = new Date().toISOString()
    await global.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    nockScope = nock('http://test-remote.com')
      .get('/data.csv').reply(200, 'col\nval1\nval2')
    dataset = await workers.hook('fileDownloader/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    nockScope.done()

    // trigger re-downloading but etag matches did not change
    await global.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    nockScope = nock('http://test-remote.com')
      .get('/data.csv').reply(304)
    dataset = await workers.hook('fileDownloader/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    nockScope.done()

    // trigger re-downloading and content changed
    await global.db.collection('datasets').updateOne(
      { id: dataset.id }, { $set: { 'remoteFile.autoUpdate.nextUpdate': nextUpdate } })
    nockScope = nock('http://test-remote.com')
      .get('/data.csv').reply(200, 'col\nval11\nval22')
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    nockScope.done()

    // trigger re-downloading and file name changed
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { remoteFile: { url: 'http://test-remote.com/data2.csv' } })
    nockScope = nock('http://test-remote.com')
      .get('/data2.csv').reply(200, 'col\nval11\nval22')
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'data2.csv')
    nockScope.done()

    // trigger re-downloading and file name is specifid by content-disposition header
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { remoteFile: { url: 'http://test-remote.com/data3.csv' } })
    nockScope = nock('http://test-remote.com')
      .get('/data3.csv').reply(200, 'col\nval11\nval22', { 'content-disposition': 'attachment; filename="remote-data.csv"' })
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.originalFile.name, 'remote-data.csv')
    nockScope.done()
  })
})
