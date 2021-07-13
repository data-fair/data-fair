const assert = require('assert').strict
const fs = require('fs')
const config = require('config')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('geo files support', () => {
  it('Process uploaded geojson dataset', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('geojsonAnalyzer')
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.schema.length, 5)
    const idField = dataset.schema.find(field => field.key === 'id')
    assert.equal(idField.type, 'string')
    const descField = dataset.schema.find(field => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find(field => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')

    // ES indexation and finalization
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0]._geopoint, '0.5,103.5')
    assert.equal(lines[0]._geocorners, undefined)
    assert.equal(lines[0]._geoshape, undefined)

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

  it('Upload geojson dataset with some schema info', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    form.append('schema', JSON.stringify([{
      key: 'prop1',
      'x-originalName': 'prop1',
      title: 'Code région',
      type: 'string',
      ignoreDetection: true,
      'x-refersTo': 'http://rdf.insee.fr/def/geo#codeRegion',
    }]))
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    const dataset = await workers.hook('geojsonAnalyzer')
    const prop1 = dataset.schema.find(p => p.key === 'prop1')
    assert.equal(prop1['x-refersTo'], 'http://rdf.insee.fr/def/geo#codeRegion')
  })

  it('Log error for geojson with broken feature', async () => {
  // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    try {
      await workers.hook('indexer')
      assert.fail()
    } catch (err) {
      // Check that there is an error message in the journal
      res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
      assert.equal(res.status, 200)
      assert.equal(res.data[0].type, 'error')
      assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
    }
  })

  // skipped, because requires ogr2ogr in the build env
  it('Process uploaded shapefile dataset', async () => {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('converter')
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.file.name, 'stations.geojson')
  })

  it('Process shapefile dataset where zip file has different name from contents', async () => {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/stations2.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations2.zip')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('converter')
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.file.name, 'stations2.geojson')
  })

  it('Upload CSV file with WKT geometries', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('geo/wkt.csv', ax)
    dataset.schema.find(p => p.key === 'geom')['x-refersTo'] = 'https://purl.org/geojson/vocab#geometry'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    dataset = await workers.hook('finalizer')
    assert.ok(dataset.bbox)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.type, 'FeatureCollection')
    assert.equal(geojson.total, 1)

    const wkt = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })).data
    assert.ok(wkt.startsWith('GEOMETRYCOLLECTION'))
  })
})
