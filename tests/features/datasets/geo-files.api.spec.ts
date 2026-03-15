// Geo files support tests
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForFinalize, waitForDatasetError, doAndWaitForFinalize, callWorkerFunction } from '../../support/workers.ts'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'

const dmeadus = await axiosAuth('dmeadus0@answers.com')

test.describe('geo files support', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('Process uploaded geojson dataset', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    // Wait for full processing (analyze + index + finalize)
    let dataset = await waitForFinalize(ax, res.data.id)
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
    assert.equal(feature.geometry.type, 'LineString')
    assert.equal(feature.properties._geopoint, '0.5,103.5')
    assert.ok(!feature.properties.geometry)

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
    const geomProp = dataset.schema.find((p: any) => p.key === 'geometry')
    geomProp['x-capabilities'] = { vtPrepare: true }
    dataset = await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    })
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
      schema: dataset.schema.filter((p: any) => !p.key.startsWith('_')).map((p: any) => ({ key: p.key }))
    }).then((r: any) => r.data)
    virtualDataset = await waitForFinalize(ax, virtualDataset.id)
    const geomPropVirtual = virtualDataset.schema.find((p: any) => p.key === 'geometry')
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

  test('Upload geojson with geometry type GeometryCollection', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-geometry-collection.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-geometry-collection.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    // Wait for full processing
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 2)
  })

  test('Upload geojson with CRS (projection)', async () => {
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-crs.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    const dataset = await waitForFinalize(ax, res.data.id)
    assert.ok(dataset.projection)
    assert.equal(dataset.projection.code, 'EPSG:27572')
    assert.equal(dataset.schema[0]['x-refersTo'], 'http://data.ign.fr/def/geometrie#Geometry')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines.length, 1)
    assert.ok(lines[0]._geopoint)
    assert.ok(lines[0]._geopoint.startsWith('46.19'))
  })

  test('Upload geojson dataset with some schema info', async () => {
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
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    // Wait for full processing and check schema
    const dataset = await waitForFinalize(ax, res.data.id)
    const prop1 = dataset.schema.find((p: any) => p.key === 'prop1')
    assert.equal(prop1['x-refersTo'], 'http://rdf.insee.fr/def/geo#codeRegion')
  })

  test('Upload geojson dataset with some managed fixes', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-broken-globalid.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken-globalid.geojson')
    form.append('extras', JSON.stringify({
      fixGeojsonGlobalId: true
    }))
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    // Wait for full processing
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.count, 2)
  })

  test('Log error for geojson with broken feature', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = res.data
    assert.equal(res.status, 201)

    // Wait for error status
    await waitForDatasetError(ax, dataset.id)

    // Check that there is an error message in the journal
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
  })

  test('Fix some polygons', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    const datasetFd = fs.readFileSync('./test-it/resources/geo/kinked-multipolygons.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = res.data
    assert.equal(res.status, 201)
    await waitForFinalize(ax, dataset.id)
  })

  test('Process uploaded shapefile dataset', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.status, 'finalized')
  })

  test('Process shapefile dataset where zip file has different name from contents', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/stations2.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations2.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.status, 'finalized')
  })

  test('Upload CSV file with WKT geometries', async () => {
    const ax = dmeadus
    let dataset = await sendDataset('geo/wkt.csv', ax)
    dataset = await doAndWaitForFinalize(ax, dataset.id, async () => {
      dataset.schema.find((p: any) => p.key === 'geom')['x-refersTo'] = 'https://purl.org/geojson/vocab#geometry'
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    })
    assert.ok(dataset.bbox)

    const geojson = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'geojson' } })).data
    assert.equal(geojson.type, 'FeatureCollection')
    assert.equal(geojson.total, 1)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { format: 'wkt' } })
    assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8')
    assert.ok(res.data.startsWith('GEOMETRYCOLLECTION'))
  })

  test('Process uploaded GPX dataset', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    const ax = dmeadus

    // Increase storage limits for this test
    await callWorkerFunction('filesProcessor', 'setConfig', { key: 'defaultLimits', value: { totalStorage: 10000000, datasetStorage: 10000000, nbDatasets: -1, datasetIndexed: -1, nbApiKeys: -1, store_nb: { limit: -1 } } })

    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/paths.gpx')
    const form = new FormData()
    form.append('file', datasetFd, 'paths.gpx')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.count, 1)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.results[0].name, 'Tronçon n°1 - de Saint-Brieuc (22) à Saint-Nic (29)')
  })

  test('Process uploaded mapinfo dataset', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/geo/troncon-mapinfo.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'troncon-mapinfo.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)

    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.status, 'finalized')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 33)
  })

  test('Create REST dataset and apply specific projection to simple coords', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest projection',
      schema: [
        { key: 'x', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordX' },
        { key: 'y', type: 'number', 'x-refersTo': 'http://data.ign.fr/def/geometrie#coordY' }
      ]
    })
    assert.equal(res.status, 201)
    const dataset = res.data

    await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.patch(`/api/v1/datasets/${dataset.id}`, {
        projection: {
          title: 'NTF (Paris) / Lambert zone II',
          code: 'EPSG:27572'
        }
      })
    })

    await doAndWaitForFinalize(ax, dataset.id, async () => {
      res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { x: 610336, y: 2132685 })
      assert.equal(res.status, 201)
    })

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'x,y,_geopoint' } })
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geopoint.startsWith('46.19'))
  })

  test('Create REST dataset and apply specific projection to geometries', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest projection',
      schema: [
        { key: 'g', type: 'string', 'x-refersTo': 'http://data.ign.fr/def/geometrie#Geometry' }
      ]
    })
    assert.equal(res.status, 201)
    const dataset = res.data

    await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.patch(`/api/v1/datasets/${dataset.id}`, {
        projection: {
          title: 'NTF (Paris) / Lambert zone II',
          code: 'EPSG:27572'
        }
      })
    })

    await doAndWaitForFinalize(ax, dataset.id, async () => {
      res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, {
        g: JSON.stringify({ type: 'LineString', coordinates: [[610336, 2132685], [610346, 2132695]] })
      })
      assert.equal(res.status, 201)
    })

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'g,_geopoint' } })
    assert.ok(res.data.results[0]._geopoint)
    assert.ok(res.data.results[0]._geopoint.startsWith('46.19'))
  })
})
