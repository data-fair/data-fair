const assert = require('assert').strict

const workers = require('../server/workers')

describe('thumbnails', () => {
  it('Create thumbnails for datasets with illustrations', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'thumbnails1',
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    await workers.hook('finalizer/thumbnails1')
    res = await ax.post('/api/v1/datasets/thumbnails1/lines', { imageUrl: 'http://test.com/image.png', desc: 'image 1' })
    await workers.hook('finalizer/thumbnails1')
    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].desc, 'image 1')
    assert.ok(res.data.results[0]._thumbnail.includes('test.com/image.png'))
  })

  it('Manage either encoded or decoded URL', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'thumbnails1',
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    await workers.hook('finalizer/thumbnails1')
    res = await ax.post('/api/v1/datasets/thumbnails1/lines', { imageUrl: 'http://test.com/imag%C3%A9.png', desc: 'image 1' })
    res = await ax.post('/api/v1/datasets/thumbnails1/lines', { imageUrl: 'http://test.com/imagé.png', desc: 'image 2' })
    await workers.hook('finalizer/thumbnails1')
    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc' } })
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].desc, 'image 2')
    assert.ok(res.data.results[0]._thumbnail.includes('test.com/imag%C3%A9.png'))
    assert.equal(res.data.results[1].desc, 'image 1')
    assert.ok(res.data.results[1]._thumbnail.includes('test.com/imag%C3%A9.png'))
  })
})
