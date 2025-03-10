import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import fs from 'fs-extra'
import path from 'node:path'
import * as workers from '../api/src/workers/index.js'
import FormData from 'form-data'

describe('Archive conversions', function () {
  it('should extract a zipped csv file', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.zip', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.zip')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a zipped geojson file', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('geo/geojson-example.zip', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.zip')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })

  it('should extract a gzipped csv file', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv.gz', ax)
    assert.equal(dataset.originalFile.name, 'dataset1.csv.gz')
    assert.equal(dataset.title, 'dataset1')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.schema[0].key, 'id')
  })

  it('should extract a gzipped file on PUT and replace it', async function () {
    const ax = global.ax.dmeadus
    const gzippedContent = fs.readFileSync(path.resolve('./resources/datasets/dataset1.csv.gz'))
    const form = new FormData()
    form.append('file', gzippedContent, 'dataset1.csv.gz')
    await ax.put('/api/v1/datasets/dataset-compressed', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer/dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))

    const schema = dataset.schema.filter(p => !p['x-calculated'])
    const locProp = schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    const csvContent = fs.readFileSync(path.resolve('./resources/datasets/dataset1.csv'))
    const form2 = new FormData()
    form2.append('file', csvContent, 'dataset1.csv')
    form2.append('schema', JSON.stringify(schema))
    await ax.put('/api/v1/datasets/dataset-compressed', form2, { headers: testUtils.formHeaders(form2) })
    dataset = await workers.hook('finalizer/dataset-compressed')
    assert.ok(dataset.schema.find(p => p.key === 'id'))
    assert.ok(dataset.schema.find(p => p.key === '_id'))
    assert.ok(dataset.bbox)
  })

  it('should extract a gzipped geojson file', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('geo/geojson-example.geojson.gz', ax)
    assert.equal(dataset.originalFile.name, 'geojson-example.geojson.gz')
    assert.equal(dataset.title, 'geojson example')
    assert.equal(dataset.file.name, 'geojson-example.geojson')
    assert.equal(dataset.schema[1].key, 'prop1')
  })
})
