const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe.only('Archive conversions', () => {
  it('should extract a zipped csv file', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.zip', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.zip')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a zipped geojson file', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('geo/geojson-example.zip', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.zip')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  it('should extract a gzipped csv file', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv.gz', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.csv.gz')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a gzipped geojson file', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('geo/geojson-example.geojson.gz', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.geojson.gz')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })
})
