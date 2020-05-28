// Some edge cases with CSV files
const assert = require('assert').strict
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('Generated geo files', () => {
  it('Process newly uploaded CSV dataset', async () => {
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
    // assert.ok(res.data.find(f => f.key === 'mbtiles'))
    assert.ok(res.data.find(f => f.key === 'geojson'))
    res = await ax.get(res.data.find(f => f.key === 'geojson').url)
    assert.equal(res.data.features[0].id, 0)
    assert.equal(res.data.features[0].properties._id, 0)
    assert.equal(res.data.features[0].type, 'Feature')
    assert.equal(res.data.features[0].geometry.type, 'Point')
  })
})
