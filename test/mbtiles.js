// Some edge cases with CSV files
const config = require('config')
const assert = require('assert').strict
const VectorTile = require('@mapbox/vector-tile').VectorTile
const Pbf = require('pbf')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('Generated mbtiles file', () => {
  if (config.tippecanoe.skip) {
    return console.log('Skip mbtiles test in this environment')
  }

  it('Process uploaded CSV dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('dataset1.csv', ax)
    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    let res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)
    await workers.hook('finalizer')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 2)
    assert.ok(res.data.find(f => f.key === 'original'))
    // disabled in test env for now
    assert.ok(res.data.find(f => f.key === 'mbtiles'))

    // fetch results as geojson
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=geojson`)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 2)

    // empty vector tile outside the box
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=3,4,7&format=pbf`)
    assert.equal(res.status, 204)
    assert.equal(res.headers['x-tilesmode'], 'es')

    // filled vector tile from mbtiles
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=pbf&select=id,_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-tilesmode'], 'mbtiles')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=pbf&select=id,_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-tilesmode'], 'cache')
    let tile = new VectorTile(new Pbf(res.data))

    // the feature from the vector tile are filled based on select
    assert.equal(tile.layers.results.length, 2)
    let feature = tile.layers.results.feature(0)
    assert.ok(feature.properties._id)
    assert.equal(feature.properties.id, 'koumoul')
    assert.equal(feature.properties.adr, undefined)
    // using _id it is possible to fetch all the data from this feature
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?qs=_id:"${feature.properties._id}"`)
    assert.equal(res.data.total, 1)
    let fullFeature = res.data.results[0]
    assert.equal(fullFeature._id, feature.properties._id)
    assert.equal(fullFeature.id, 'koumoul')
    assert.equal(fullFeature.adr, '19 rue de la voie lactée saint avé')

    // re-check after a reindex,, to prevent regression on a previous bug
    res = await global.ax.superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await workers.hook('finalizer')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=pbf&select=id,_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-tilesmode'], 'mbtiles')
    tile = new VectorTile(new Pbf(res.data))
    assert.equal(tile.layers.results.length, 2)
    feature = tile.layers.results.feature(0)
    assert.ok(feature.properties._id)
    assert.equal(feature.properties.id, 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?qs=_id:"${feature.properties._id}"`)
    assert.equal(res.data.total, 1)
    fullFeature = res.data.results[0]
    assert.equal(fullFeature._id, feature.properties._id)
  })

  it('process uploaded geojson file', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('geojson-example.geojson', ax)

    // fetch results as geojson
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=geojson`)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 3)

    // empty vector tile outside the box
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=3,4,7&format=pbf`)
    assert.equal(res.status, 204)
    assert.equal(res.headers['x-tilesmode'], 'es')

    // filled vector tile from mbtiles
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=pbf&select=id,_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-tilesmode'], 'mbtiles')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=0,0,0&format=pbf&select=id,_id`, { responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-tilesmode'], 'cache')
  })
})
