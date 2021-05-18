const assert = require('assert').strict
const workers = require('../server/workers')

describe('Properties capabilities', () => {
  it('Disable case-sensitive sort', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-insensitive',
      schema: [{ key: 'str1', type: 'string' }],
    })
    await workers.hook('finalizer/rest-insensitive')
    res = await ax.post('/api/v1/datasets/rest-insensitive/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' },
    ])
    await workers.hook('finalizer/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['test1', 'Test2', 'test2', 'test3'])

    await ax.patch('/api/v1/datasets/rest-insensitive', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }] })
    await workers.hook('finalizer/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'test1', 'test2', 'test3'])
  })

  it('Disable values (agg and sort)', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-values',
      schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }],
    })
    await workers.hook('finalizer/rest-values')
    res = await ax.post('/api/v1/datasets/rest-values/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' },
    ])
    await workers.hook('finalizer/rest-values')
    res = await ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'test1', 'test2', 'test3'])
    res = await ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 4)

    await ax.patch('/api/v1/datasets/rest-values', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false, values: false } }] })
    await workers.hook('finalizer/rest-values')
    try {
      await ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.startsWith('Impossible de trier'))
    }
    try {
      await ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.startsWith('Impossible de grouper'))
    }
  })

  it('Disable text agg', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-textagg',
      schema: [{ key: 'str1', type: 'string' }],
    })
    await workers.hook('finalizer/rest-textagg')
    res = await ax.post('/api/v1/datasets/rest-textagg/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' },
    ])
    await workers.hook('finalizer/rest-textagg')
    res = await ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 4)

    await ax.patch('/api/v1/datasets/rest-textagg', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { textAgg: false } }] })
    await workers.hook('finalizer/rest-textagg')
    try {
      await ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.startsWith('Impossible d\'agréger'))
    }
  })

  it('Disable keyword indexing', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-index',
      schema: [{ key: 'str1', type: 'string' }],
    })
    await workers.hook('finalizer/rest-index')
    res = await ax.post('/api/v1/datasets/rest-index/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' },
    ])
    await workers.hook('finalizer/rest-index')
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } })
    assert.equal(res.data.total, 2)

    await ax.patch('/api/v1/datasets/rest-index', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { index: false } }] })
    await workers.hook('finalizer/rest-index')
    try {
      res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.startsWith('Impossible de faire une recherche'))
    }
    try {
      res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.startsWith('Impossible de faire une recherche'))
    }
  })

  it('Disable text indexing', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-text',
      schema: [{ key: 'str1', type: 'string' }],
    })
    await workers.hook('finalizer/rest-text')
    res = await ax.post('/api/v1/datasets/rest-text/_bulk_lines', [
      { str1: 'ceci est une phrase pour tester' },
      { str1: 'ceci est un autre test' },
    ])
    await workers.hook('finalizer/rest-text')
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'tester' } })
    assert.equal(res.data.total, 2)

    await ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false } }] })
    await workers.hook('finalizer/rest-text')

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 1)

    await ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false, textStandard: false } }] })
    await workers.hook('finalizer/rest-text')

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 0)
  })

  it('Disable geoshape indexing', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-geoshape',
      schema: [{ key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' }],
    })
    await workers.hook('finalizer/rest-geoshape')
    res = await ax.post('/api/v1/datasets/rest-geoshape/_bulk_lines', [
      { geom: JSON.stringify({ type: 'Polygon', coordinates: [[[-2.42, 47.86], [-2.38, 47.86], [-2.38, 47.88], [-2.42, 47.88], [-2.42, 47.86]]] }) },
      { geom: JSON.stringify({ type: 'Point', coordinates: [-2.40, 47.89] }) },
    ])
    await workers.hook('finalizer/rest-geoshape')

    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.41,47.87,0' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)

    await ax.patch('/api/v1/datasets/rest-geoshape', {
      schema: [
        { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry', 'x-capabilities': { geoShape: false } },
      ],
    })
    await workers.hook('finalizer/rest-geoshape')

    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.41,47.87,0' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.40,47.89' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)
  })
})
