const assert = require('assert').strict
const fs = require('fs')
const nock = require('nock')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('thumbnails', () => {
  it(' should create thumbnails for datasets with illustrations', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/thumbnails1', {
      isRest: true,
      title: 'thumbnails1',
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    await workers.hook('finalizer/thumbnails1')
    res = await ax.post('/api/v1/datasets/thumbnails1/_bulk_lines', [
      { imageUrl: 'http://test-thumbnail.com/image.png', desc: 'image 1' },
      { imageUrl: 'http://test-thumbnail.com/avatar.jpg', desc: 'avatar' }
    ])
    await workers.hook('finalizer/thumbnails1')
    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc', sort: '-desc' } })
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].desc, 'image 1')
    assert.equal(res.data.results[1].desc, 'avatar')
    assert.ok(res.data.results[0]._thumbnail.endsWith('width=300&height=200'))
    const nockScope = nock('http://test-thumbnail.com')
      .get('/image.png').reply(200, () => '')
      .get('/avatar.jpg').reply(200, () => fs.readFileSync('test/resources/avatar.jpeg'))
      .persist()
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err) => err.status === 302)
    res = await ax.get(res.data.results[1]._thumbnail)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(res.headers['cache-control'], 'no-cache, private')
    nockScope.done()
  })

  it('should create thumbnail for the image metadata of a dataset', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'http://test-thumbnail.com/dataset-image.jpg'
    })
    await workers.hook('finalizer/thumbnail')
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    const nockScope = nock('http://test-thumbnail.com')
      .get('/dataset-image.jpg').reply(200, () => fs.readFileSync('test/resources/avatar.jpeg'))
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-thumbnails-cache-status'], 'MISS')
    nockScope.done()
  })

  // keep this test skipped most of the time as it depends on an outside service
  it.skip('should provide a redirect for an unsupported image format', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'https://geocatalogue.lannion-tregor.com/geonetwork/srv/api/records/c4576973-28cd-47d5-a082-7871f96d8f14/attachments/reseau_transport_scolaire.JPG'
    })
    await workers.hook('finalizer/thumbnail')
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/jpg')
  })

  it('should create thumbnails from attachments', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    const dataset = res.data
    await workers.hook('finalizer/' + dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true } })
    const thumbnail1 = res.data.results[0]._thumbnail
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err) => err.status === 302)
    await assert.rejects(global.ax.anonymous.get(res.data.results[0]._thumbnail), (err) => err.status === 403)
    assert.ok(thumbnail1.startsWith(`http://localhost:5600/data-fair/api/v1/datasets/${dataset.id}/thumbnail/`))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true }, headers: { host: 'test.com' } })
    assert.equal(thumbnail1.replace('localhost:5600', 'test.com'), res.data.results[0]._thumbnail)
  })
})
