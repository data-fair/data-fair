import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import fs from 'fs-extra'
import FormData from 'form-data'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, cdurning2, superadmin, formHeaders } from './utils/index.ts'

describe('Properties capabilities', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Disable case-sensitive sort', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-insensitive', {
      isRest: true,
      title: 'rest-insensitive',
      schema: [{ key: 'str1', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest-insensitive/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['test1', 'Test2', 'test2', 'test3'])

    await ax.patch('/api/v1/datasets/rest-insensitive', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }] })
    await workers.hook('finalize/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'test1', 'test2', 'test3'])
  })

  it('Disable values (agg and sort)', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-values', {
      isRest: true,
      title: 'rest-values',
      schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }]
    })
    res = await ax.post('/api/v1/datasets/rest-values/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'test1' },
      { str1: 'test1' },
      { str1: 'test1' },
      { str1: 'Test2' },
      { str1: 'Test2' },
      { str1: 'Test2' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook('finalize/rest-values')
    let prop = dataset.schema.find(p => p.key === 'str1')
    assert.equal(prop['x-cardinality'], 4)
    assert.ok(prop.enum)
    res = await ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'Test2', 'Test2', 'test1', 'test1', 'test1', 'test1', 'test2', 'test3'])
    res = await ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 9)

    await ax.patch('/api/v1/datasets/rest-values', {
      schema: [{
        key: 'str1',
        type: 'string',
        'x-capabilities': {
          insensitive: false, values: false
        }
      }]
    })
    dataset = await workers.hook('finalize/rest-values')
    prop = dataset.schema.find(p => p.key === 'str1')
    assert.equal(prop['x-cardinality'], undefined)
    assert.ok(!prop.enum)
    try {
      await ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible de trier'))
    }
    try {
      await ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible de grouper'))
    }
  })

  it('Enable text agg', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-textagg', {
      isRest: true,
      title: 'rest-textagg',
      schema: [{ key: 'str1', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest-textagg/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-textagg')

    let aggSchema = (await ax.get('/api/v1/datasets/rest-textagg/schema', { params: { capability: 'textAgg' } })).data
    assert.equal(aggSchema.length, 0)
    await assert.rejects(ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } }), (err: any) => err.status === 400)

    await ax.patch('/api/v1/datasets/rest-textagg', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { textAgg: true } }] })
    await workers.hook('finalize/rest-textagg')

    aggSchema = (await ax.get('/api/v1/datasets/rest-textagg/schema', { params: { capability: 'textAgg' } })).data
    assert.equal(aggSchema.length, 1)
    res = await ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 4)
  })

  it('Disable keyword indexing', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-index', {
      isRest: true,
      title: 'rest-index',
      schema: [{ key: 'str1', type: 'string', 'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret' }]
    })
    res = await ax.post('/api/v1/datasets/rest-index/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-index')
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } })
    assert.equal(res.data.total, 2)

    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { _c_siret_in: 'test3,test2' } })
    assert.equal(res.data.total, 2)

    await ax.patch('/api/v1/datasets/rest-index', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { index: false } }] })
    await workers.hook('finalize/rest-index')
    try {
      res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible d\'appliquer un filtre'))
    }
    try {
      res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('Impossible d\'appliquer un filtre'))
    }
  })

  it('Disable text indexing', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-text', {
      isRest: true,
      title: 'rest-text',
      schema: [{ key: 'str1', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest-text/_bulk_lines', [
      { str1: 'ceci est une phrase pour tester' },
      { str1: 'ceci est un autre test' },
      { str1: 'ceci est un autre têst avec un accent imprévu' }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-text')
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 3)
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'tester' } })
    assert.equal(res.data.total, 3)

    await ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false } }] })
    await workers.hook('finalize/rest-text')

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 1)

    await ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false, textStandard: false } }] })
    await workers.hook('finalize/rest-text')

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 0)
  })

  it('Disable geoshape indexing', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-geoshape', {
      isRest: true,
      title: 'rest-geoshape',
      schema: [{ key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' }]
    })
    res = await ax.post('/api/v1/datasets/rest-geoshape/_bulk_lines', [
      { geom: JSON.stringify({ type: 'Polygon', coordinates: [[[-2.42, 47.86], [-2.38, 47.86], [-2.38, 47.88], [-2.42, 47.88], [-2.42, 47.86]]] }) },
      { geom: JSON.stringify({ type: 'Point', coordinates: [-2.40, 47.89] }) }
    ])
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/rest-geoshape')

    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.41,47.87,0' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { _c_bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)

    await ax.patch('/api/v1/datasets/rest-geoshape', {
      schema: [
        { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry', 'x-capabilities': { geoShape: false, geoCorners: false } }
      ]
    })
    const dataset = await workers.hook('finalize/rest-geoshape')
    const geoShapeProp = dataset.schema.find(p => p.key === '_geoshape')
    assert.ok(geoShapeProp)
    assert.equal(geoShapeProp['x-capabilities'].geoShape, false)
    assert.ok(!dataset.schema.find(p => p.key === '_geocorners'))
    const diagnostic = (await superadmin.get('/api/v1/datasets/rest-geoshape/_diagnose')).data
    const indexDefinition = diagnostic.esInfos.index.definition
    assert.equal(indexDefinition.mappings.properties._geoshape.enabled, false)
    assert.equal(indexDefinition.mappings.properties.geom.index, false)
    assert.ok(!indexDefinition.mappings.properties.geom.fields)

    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.41,47.87,0' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.40,47.89' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)
  })

  it('Disable extracting text from attachment', async function () {
    const ax = cdurning2

    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)

    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find(p => p.key === '_file.content'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'libreoffice' } })
    assert.equal(res.data.total, 1)
    assert.equal(dataset.storage.indexed.size, dataset.storage.size)
    assert.equal(dataset.storage.indexed.parts.length, 2)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: [
        { key: 'attachment', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument', 'x-capabilities': { indexAttachment: false } }
      ]
    })

    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.schema.find(p => p.key === '_file.content'), undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'libreoffice' } })
    assert.equal(res.data.total, 0)
    assert.ok(dataset.storage.indexed.size < dataset.storage.size)
    assert.equal(dataset.storage.indexed.parts.length, 1)
  })
})
