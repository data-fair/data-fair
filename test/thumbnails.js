import { strict as assert } from 'node:assert'

import * as testUtils from './resources/test-utils.js'
import fs from 'node:fs'
import nock from 'nock'
import FormData from 'form-data'

import * as workers from '../api/src/workers/index.js'

describe('thumbnails', function () {
  it(' should create thumbnails for datasets with illustrations', async function () {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets/thumbnails1', {
      isRest: true,
      title: 'thumbnails1',
      attachmentsAsImage: true,
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    res = await ax.post('/api/v1/datasets/thumbnails1/_bulk_lines', [
      { imageUrl: 'http://test-thumbnail.com/image.png', desc: '1 image' },
      { imageUrl: 'http://test-thumbnail.com/avatar.jpg', desc: '2 avatar' },
      { imageUrl: 'http://test-thumbnail.com/wikipedia.gif', desc: '3 wikipedia animated' }
    ])
    await workers.hook('finalizer/thumbnails1')
    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc', sort: 'desc' } })
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].desc, '1 image')
    assert.equal(res.data.results[1].desc, '2 avatar')
    assert.equal(res.data.results[2].desc, '3 wikipedia animated')
    assert.ok(res.data.results[0]._thumbnail.endsWith('width=300&height=200'))
    const nockScope = nock('http://test-thumbnail.com')
      .get('/image.png').reply(200, () => '')
      .get('/avatar.jpg').reply(200, () => fs.readFileSync('resources/avatar.jpeg'))
      .get('/wikipedia.gif').reply(200, () => fs.readFileSync('resources/wikipedia.gif'))
      .persist()
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err) => err.status === 302)
    const thumbres = await ax.get(res.data.results[1]._thumbnail)
    assert.equal(thumbres.headers['content-type'], 'image/png')
    assert.equal(thumbres.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbres.headers['cache-control'], 'must-revalidate, private, max-age=0')

    const thumbresGif = await ax.get(res.data.results[2]._thumbnail)
    assert.equal(thumbresGif.headers['content-type'], 'image/webp')
    assert.equal(thumbresGif.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbresGif.headers['cache-control'], 'must-revalidate, private, max-age=0')
    nockScope.done()
  })

  it('should create thumbnail for the image metadata of a dataset', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'http://test-thumbnail.com/dataset-image.jpg'
    })
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    const nockScope = nock('http://test-thumbnail.com')
      .get('/dataset-image.jpg').reply(200, () => fs.readFileSync('resources/avatar.jpeg'))
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-thumbnails-cache-status'], 'MISS')
    nockScope.done()
  })

  // keep this test skipped most of the time as it depends on an outside service
  it.skip('should provide a redirect for an unsupported image format', async function () {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'https://geocatalogue.lannion-tregor.com/geonetwork/srv/api/records/c4576973-28cd-47d5-a082-7871f96d8f14/attachments/reseau_transport_scolaire.JPG'
    })
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/jpg')
  })

  it('should create thumbnails from attachments', async function () {
    const ax = global.ax.dmeadusOrg
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalizer/' + res.data.id)
    assert.ok(dataset.draft.schema.some((field) => field.key === '_attachment_url' && field['x-refersTo'] === 'http://schema.org/image'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true } })
    const thumbnail1 = res.data.results[0]._thumbnail
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err) => err.status === 302)
    await assert.rejects(global.ax.anonymous.get(res.data.results[0]._thumbnail), (err) => err.status === 403)
    assert.ok(thumbnail1.startsWith(`http://localhost:5600/data-fair/api/v1/datasets/${dataset.id}/thumbnail/`))

    const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:5601' }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true }, headers: { host: 'localhost:5601' } })
    assert.equal(thumbnail1.replace('localhost:5600', 'localhost:5601'), res.data.results[0]._thumbnail)

    // remove attachmentsAsImage
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { attachmentsAsImage: null }, { params: { draft: true } })).data
    assert.ok(dataset.schema.some((field) => field.key === '_attachment_url' && field['x-refersTo'] === undefined))
  })
})
