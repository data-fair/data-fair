import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import fs from 'node:fs'
import config from 'config'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.js'

describe('geo files support', function () {
  it('Process uploaded geojson dataset', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('geojsonAnalyzer')
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.schema.length, 6)
    const idField = dataset.schema.find(field => field.key === 'id')
    assert.equal(idField.type, 'string')
    const descField = dataset.schema.find(field => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find(field => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')
    const intField = dataset.schema.find(field => field.key === 'int')
    assert.equal(intField.type, 'integer')

    // ES indexation and finalization
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0]._geopoint, '0.5,103.5')
    assert.equal(lines[0]._geocorners, undefined)
    assert.equal(lines[0]._geoshape, undefined)
    assert.equal(lines[0].int, 0)
    assert.equal(lines[1].int, 2)
    assert.equal(lines[2].int, undefined)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.features.length, 3)
    const feature = geojson.features[0]
    assert.equal(feature.properties._i, 1)
    assert.equal(feature.properties.bool, true)

    const wkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })).data
    assert.ok(wkt.startsWith('GEOMETRYCOLLECTION'))

    const jsonWkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { wkt: 'true' } })).data
    assert.ok(jsonWkt.results[0].geometry.startsWith('LINESTRING'))
  })

  it('Upload geojson with geometry type GeometryCollection', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/geojson-geometry-collection.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-geometry-collection.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('geojsonAnalyzer')
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.schema.length, 6)
    const idField = dataset.schema.find(field => field.key === 'id')
    assert.equal(idField.type, 'string')
    const descField = dataset.schema.find(field => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find(field => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')
    const intField = dataset.schema.find(field => field.key === 'int')
    assert.equal(intField.type, 'integer')

    // ES indexation and finalization
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
  })

  it('Upload geojson with CRS (projection)', async function () {
    const datasetFd = fs.readFileSync('./resources/geo/geojson-crs.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    const dataset = await workers.hook('finalizer/' + res.data.id)
    assert.ok(dataset.projection)
    assert.equal(dataset.projection.code, 'EPSG:27572')
    assert.equal(dataset.schema[0]['x-refersTo'], 'http://data.ign.fr/def/geometrie#Geometry')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 1)
    assert.ok(lines[0]._geopoint)
    assert.ok(lines[0]._geopoint.startsWith('46.19'))
  })

  it('Upload geojson dataset with some schema info', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    form.append('schema', JSON.stringify([{
      key: 'prop1',
      'x-originalName': 'prop1',
      title: 'Code région',
      type: 'string',
      'x-refersTo': 'http://rdf.insee.fr/def/geo#codeRegion'
    }]))
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    const dataset = await workers.hook('geojsonAnalyzer/' + res.data.id)
    const prop1 = dataset.schema.find(p => p.key === 'prop1')
    assert.equal(prop1['x-refersTo'], 'http://rdf.insee.fr/def/geo#codeRegion')
    await workers.hook('finalizer/' + dataset.id)
  })

  it('Upload geojson dataset with some managed fixes', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/geojson-broken-globalid.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken-globalid.geojson')
    form.append('extras', JSON.stringify({
      fixGeojsonGlobalId: true
    }))
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    const dataset = await workers.hook('finalizer/' + res.data.id)
    assert.equal(dataset.count, 2)
  })

  it('Log error for geojson with broken feature', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    try {
      await workers.hook('indexer/' + dataset.id)
      assert.fail()
    } catch (err) {
      // Check that there is an error message in the journal
      res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
      assert.equal(res.status, 200)
      assert.equal(res.data[0].type, 'error')
      assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
    }
  })

  // This test is disabled because it depends on prepair which is not available in the CI
  it('Fix some polygons', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip prepair test in this environment')
    }
    const datasetFd = fs.readFileSync('./resources/geo/kinked-multipolygons.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)
    await workers.hook('indexer/' + dataset.id)
  })

  it('Process uploaded shapefile dataset', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('fileNormalizer/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'stations.geojson')

    assert.equal(dataset.storage.dataFiles.length, 2)
    assert.equal(dataset.storage.attachments.size, 0)
    await workers.hook('finalizer/' + dataset.id)
  })

  it('Process shapefile dataset where zip file has different name from contents', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/stations2.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations2.zip')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('fileNormalizer/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'stations2.geojson')
    await workers.hook('finalizer/' + dataset.id)
  })

  it('Upload CSV file with WKT geometries', async function () {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('geo/wkt.csv', ax)
    dataset.schema.find(p => p.key === 'geom')['x-refersTo'] = 'https://purl.org/geojson/vocab#geometry'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.ok(dataset.bbox)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.type, 'FeatureCollection')
    assert.equal(geojson.total, 1)

    const wkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })).data
    assert.ok(wkt.startsWith('GEOMETRYCOLLECTION'))
  })

  it('Process uploaded GPX dataset', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }
    const oldLimit = { ...config.defaultLimits }
    config.defaultLimits.totalStorage = config.defaultLimits.datasetStorage = 10000000

    // Send dataset
    const datasetFd = fs.readFileSync('./resources/geo/paths.gpx')
    const form = new FormData()
    form.append('file', datasetFd, 'paths.gpx')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    let dataset = await workers.hook('fileNormalizer/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'paths.geojson')

    assert.equal(dataset.storage.dataFiles.length, 2)
    assert.equal(dataset.storage.attachments.size, 0)

    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.count, 1)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.results[0].name, 'Tronçon n°1 - de Saint-Brieuc (22) à Saint-Nic (29)')

    config.defaultLimits = oldLimit
  })
})
