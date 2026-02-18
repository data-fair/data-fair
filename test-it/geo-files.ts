import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import config from 'config'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('geo files support', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process uploaded geojson dataset', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('analyzeGeojson/' + res.data.id)
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.schema.length, 8)
    const idField = dataset.schema.find(field => field.key === 'id')
    assert.equal(idField.type, 'string')
    const descField = dataset.schema.find(field => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find(field => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')
    const intField = dataset.schema.find(field => field.key === 'int')
    assert.equal(intField.type, 'integer')
    assert.ok(dataset.schema.find(field => field.key === 'objp1'))
    assert.ok(dataset.schema.find(field => field.key === 'objp2'))

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0]._geopoint, '0.5,103.5')
    assert.equal(lines[0]._geocorners, undefined)
    assert.equal(lines[0]._geoshape, undefined)
    assert.equal(lines[0].int, 0)
    assert.equal(lines[0].objp1, 'p 1')
    assert.equal(lines[0].objp2, 'p 2')
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

    // vector tiles
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=kinked`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=49,31,6&format=pbf&q=blabla`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/neighbors/10000')
    assert.equal(res.headers['x-tilesampling'], '1/1')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=51,31,6&format=pbf`)
    assert.equal(res.status, 204)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=49,31,6&format=pbf&q=blabla&sampling=max`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/max')
    assert.equal(res.headers['x-tilesampling'], '1/1')
    // vector tiles with some preparation at index time
    const geomProp = dataset.schema.find(p => p.key === 'geometry')
    geomProp['x-capabilities'] = { vtPrepare: true }
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook(`indexLines/${dataset.id}`)
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=49,31,6&format=pbf&q=blabla&sampling=max`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/max/prepared')
    assert.equal(res.headers['x-tilesampling'], '1/1')

    // virtual dataset based on this file
    let virtualDataset = await ax.post('/api/v1/datasets', {
      title: 'virtual dataset',
      isVirtual: true,
      virtual: {
        children: [dataset.id]
      },
      schema: dataset.schema.filter(p => !p.key.startsWith('_')).map(p => ({ key: p.key }))
    }).then(r => r.data)
    virtualDataset = await workers.hook(`finalize/${virtualDataset.id}`)
    const geomPropVirtual = virtualDataset.schema.find(p => p.key === 'geometry')
    assert.ok(geomPropVirtual['x-capabilities'].vtPrepare)
    res = await ax.get(`/api/v1/datasets/${virtualDataset.id}/lines?xyz=49,31,6&format=pbf&q=blabla&sampling=max`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/max/prepared')
    const vt = new VectorTile(new Protobuf(res.data))
    assert.ok(vt.layers.results)
    assert.equal(vt.layers.results.length, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.ok(!res.data.results[0]._vt_prepared)
    assert.ok(!res.data.results[0]._vt)
  })

  it('Upload geojson with geometry type GeometryCollection', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-geometry-collection.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-geometry-collection.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('analyzeGeojson/' + res.data.id)
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
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
  })

  it('Upload geojson with CRS (projection)', async function () {
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-crs.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    const dataset = await workers.hook('finalize/' + res.data.id)
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
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    form.append('schema', JSON.stringify([{
      key: 'prop1',
      'x-originalName': 'prop1',
      title: 'Code région',
      type: 'string',
      'x-refersTo': 'http://rdf.insee.fr/def/geo#codeRegion'
    }]))
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    const dataset = await workers.hook('analyzeGeojson/' + res.data.id)
    const prop1 = dataset.schema.find(p => p.key === 'prop1')
    assert.equal(prop1['x-refersTo'], 'http://rdf.insee.fr/def/geo#codeRegion')
    await workers.hook('finalize/' + dataset.id)
  })

  it('Upload geojson dataset with some managed fixes', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-broken-globalid.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken-globalid.geojson')
    form.append('extras', JSON.stringify({
      fixGeojsonGlobalId: true
    }))
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.count, 2)
  })

  it('Log error for geojson with broken feature', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    await assert.rejects(
      workers.hook('indexLines/' + dataset.id)
    )
    // Check that there is an error message in the journal
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
  })

  // This test is disabled because it depends on prepair which is not available in the CI
  it('Fix some polygons', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip prepair test in this environment')
    }
    const datasetFd = fs.readFileSync('./test-it/resources/geo/kinked-multipolygons.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)
    await workers.hook('indexLines/' + dataset.id)
  })

  it('Process uploaded shapefile dataset', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('normalizeFile/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'stations.geojson')

    assert.equal(dataset.storage.dataFiles.length, 2)
    assert.equal(dataset.storage.attachments.size, 0)
    await workers.hook('finalize/' + dataset.id)
  })

  it('Process shapefile dataset where zip file has different name from contents', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/stations2.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations2.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('normalizeFile/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'stations2.geojson')
    await workers.hook('finalize/' + dataset.id)
  })

  it('Upload CSV file with WKT geometries', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('geo/wkt.csv', ax)
    dataset.schema.find(p => p.key === 'geom')['x-refersTo'] = 'https://purl.org/geojson/vocab#geometry'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.ok(dataset.bbox)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.type, 'FeatureCollection')
    assert.equal(geojson.total, 1)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })
    assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8')
    assert.ok(res.data.startsWith('GEOMETRYCOLLECTION'))
  })

  it('Process uploaded GPX dataset', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }
    const oldLimit = { ...config.defaultLimits }
    config.defaultLimits.totalStorage = config.defaultLimits.datasetStorage = 10000000
    await workers.workers.filesProcessor.run({ key: 'defaultLimits', value: config.defaultLimits }, { name: 'setConfig' })

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/paths.gpx')
    const form = new FormData()
    form.append('file', datasetFd, 'paths.gpx')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    let dataset = await workers.hook('normalizeFile/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'paths.geojson')

    assert.equal(dataset.storage.dataFiles.length, 2)
    assert.equal(dataset.storage.attachments.size, 0)

    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 1)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.results[0].name, 'Tronçon n°1 - de Saint-Brieuc (22) à Saint-Nic (29)')

    config.defaultLimits = oldLimit
    await workers.workers.filesProcessor.run({ key: 'defaultLimits', value: oldLimit }, { name: 'setConfig' })
  })

  it('Process uploaded mapinfo dataset', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/troncon-mapinfo.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'troncon-mapinfo.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // dataset converted
    const dataset = await workers.hook('normalizeFile/' + res.data.id)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'troncon-mapinfo.geojson')

    assert.equal(dataset.storage.dataFiles.length, 2)
    assert.equal(dataset.storage.attachments.size, 0)
    await workers.hook('finalize/' + dataset.id)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 33)
  })
})
