import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, clearDatasetCache } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const cdurning2 = await axiosAuth('cdurning2@desdev.cn')
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)

test.describe('Properties capabilities', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Disable case-sensitive sort', async () => {
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
    await waitForFinalize(ax, 'rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map((result: any) => result.str1), ['test1', 'Test2', 'test2', 'test3'])

    await doAndWaitForFinalize(ax, 'rest-insensitive', () =>
      ax.patch('/api/v1/datasets/rest-insensitive', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }] }))
    await clearDatasetCache()
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map((result: any) => result.str1), ['Test2', 'test1', 'test2', 'test3'])
  })

  test('Disable values (agg and sort)', async () => {
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
    let dataset = await waitForFinalize(ax, 'rest-values')
    let prop = dataset.schema.find((p: any) => p.key === 'str1')
    assert.equal(prop['x-cardinality'], 4)
    assert.ok(prop.enum)
    res = await ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map((result: any) => result.str1), ['Test2', 'Test2', 'Test2', 'test1', 'test1', 'test1', 'test1', 'test2', 'test3'])
    res = await ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 9)

    dataset = await doAndWaitForFinalize(ax, 'rest-values', () =>
      ax.patch('/api/v1/datasets/rest-values', {
        schema: [{
          key: 'str1',
          type: 'string',
          'x-capabilities': {
            insensitive: false, values: false
          }
        }]
      }))
    await clearDatasetCache()
    prop = dataset.schema.find((p: any) => p.key === 'str1')
    assert.equal(prop['x-cardinality'], undefined)
    assert.ok(!prop.enum)
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-values/lines', { params: { sort: 'str1' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Impossible de trier'))
        return true
      }
    )
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-values/values_agg', { params: { field: 'str1' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Impossible de grouper'))
        return true
      }
    )
  })

  test('Enable text agg', async () => {
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
    await waitForFinalize(ax, 'rest-textagg')

    let aggSchema = (await ax.get('/api/v1/datasets/rest-textagg/schema', { params: { capability: 'textAgg' } })).data
    assert.equal(aggSchema.length, 0)
    await assert.rejects(ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } }), (err: any) => err.status === 400)

    await doAndWaitForFinalize(ax, 'rest-textagg', () =>
      ax.patch('/api/v1/datasets/rest-textagg', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { textAgg: true } }] }))
    await clearDatasetCache()

    aggSchema = (await ax.get('/api/v1/datasets/rest-textagg/schema', { params: { capability: 'textAgg' } })).data
    assert.equal(aggSchema.length, 1)
    res = await ax.get('/api/v1/datasets/rest-textagg/words_agg', { params: { field: 'str1' } })
    assert.equal(res.data.total, 4)
  })

  test('Disable keyword indexing', async () => {
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
    await waitForFinalize(ax, 'rest-index')
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } })
    assert.equal(res.data.total, 2)

    res = await ax.get('/api/v1/datasets/rest-index/lines', { params: { _c_siret_in: 'test3,test2' } })
    assert.equal(res.data.total, 2)

    await doAndWaitForFinalize(ax, 'rest-index', () =>
      ax.patch('/api/v1/datasets/rest-index', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { index: false } }] }))
    await clearDatasetCache()
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-index/lines', { params: { qs: 'str1:test3' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Impossible d\'appliquer un filtre'))
        return true
      }
    )
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-index/lines', { params: { str1_in: 'test3,test2' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Impossible d\'appliquer un filtre'))
        return true
      }
    )
  })

  test('Disable text indexing', async () => {
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
    await waitForFinalize(ax, 'rest-text')
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 3)
    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'tester' } })
    assert.equal(res.data.total, 3)

    await doAndWaitForFinalize(ax, 'rest-text', () =>
      ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false } }] }))
    await clearDatasetCache()

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 1)

    await doAndWaitForFinalize(ax, 'rest-text', () =>
      ax.patch('/api/v1/datasets/rest-text', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { text: false, textStandard: false } }] }))
    await clearDatasetCache()

    res = await ax.get('/api/v1/datasets/rest-text/lines', { params: { q: 'test' } })
    assert.equal(res.data.total, 0)
  })

  test('Disable geoshape indexing', async () => {
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
    await waitForFinalize(ax, 'rest-geoshape')

    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { geo_distance: '-2.41,47.87,0' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)
    res = await ax.get('/api/v1/datasets/rest-geoshape/lines', { params: { _c_bbox: '-2.41,47.8,-2.35,47.9' } })
    assert.equal(res.data.total, 2)

    const dataset = await doAndWaitForFinalize(ax, 'rest-geoshape', () =>
      ax.patch('/api/v1/datasets/rest-geoshape', {
        schema: [
          { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry', 'x-capabilities': { geoShape: false, geoCorners: false } }
        ]
      }))
    await clearDatasetCache()
    const geoShapeProp = dataset.schema.find((p: any) => p.key === '_geoshape')
    assert.ok(geoShapeProp)
    assert.equal(geoShapeProp['x-capabilities'].geoShape, false)
    assert.ok(!dataset.schema.find((p: any) => p.key === '_geocorners'))
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

  test('Disable extracting text from attachment', async () => {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = res.data
    assert.equal(res.status, 201)

    dataset = await waitForFinalize(ax, dataset.id)
    // _file.content is searchable
    assert.ok(dataset.schema.find((p: any) => p.key === '_file.content'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'libreoffice' } })
    assert.equal(res.data.total, 1)
    // attachments are counted in indexed storage
    assert.equal(dataset.storage.indexed.size, dataset.storage.size)
    assert.equal(dataset.storage.indexed.parts.length, 2)

    dataset = await doAndWaitForFinalize(ax, dataset.id, () =>
      ax.patch(`/api/v1/datasets/${dataset.id}`, {
        schema: [
          { key: 'attachment', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument', 'x-capabilities': { indexAttachment: false } }
        ]
      }))
    await clearDatasetCache()
    // _file.content is no longer searchable
    assert.equal(dataset.schema.find((p: any) => p.key === '_file.content'), undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'libreoffice' } })
    assert.equal(res.data.total, 0)
    // attachments are no longer counted in indexed storage
    assert.ok(dataset.storage.indexed.size < dataset.storage.size)
    assert.equal(dataset.storage.indexed.parts.length, 1)
  })
})
