const assert = require('assert').strict
const fs = require('fs')
const nock = require('nock')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const config = require('config')

const workers = require('../server/workers')
const esUtils = require('../server/utils/es')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

describe('workers', () => {
  it('Process newly uploaded CSV dataset', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('csvAnalyzer')
    assert.equal(dataset.status, 'analyzed')

    // Auto schema proposal
    dataset = await workers.hook('csvSchematizer')
    assert.equal(dataset.status, 'schematized')
    const idField = dataset.schema.find(f => f.key === 'id')
    const dateField = dataset.schema.find(f => f.key === 'some_date')
    assert.equal(idField.type, 'string')
    assert.equal(idField.format, 'uri-reference')
    assert.equal(dateField.type, 'string')
    assert.equal(dateField.format, 'date')

    // ES indexation and finalization
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    const idProp = dataset.schema.find(p => p.key === 'id')
    assert.equal(idProp['x-cardinality'], 2)
    assert.notEqual(idProp.enum.indexOf('koumoul'), -1)
    const esIndices = (await global.es.indices.get({ index: esUtils.aliasName(dataset) })).body
    const esIndex = Object.values(esIndices)[0]
    const mapping = esIndex.mappings
    assert.equal(mapping.properties.id.type, 'keyword')
    assert.equal(mapping.properties.adr.type, 'keyword')
    assert.equal(mapping.properties.adr.fields.text.type, 'text')
    assert.equal(mapping.properties.some_date.type, 'date')

    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)

    // Second ES indexation
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    const esIndices2 = (await global.es.indices.get({ index: esUtils.aliasName(dataset) })).body
    const esIndex2 = Object.values(esIndices2)[0]
    const mapping2 = esIndex2.mappings
    assert.equal(mapping2.properties.id.type, 'keyword')
    assert.equal(mapping2.properties.adr.type, 'keyword')
    assert.equal(mapping2.properties.some_date.type, 'date')
    assert.equal(mapping2.properties.loc.type, 'keyword')
    assert.equal(mapping2.properties._geopoint.type, 'geo_point')

    // Reupload data with bad localization
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
    try {
      dataset = await workers.hook('indexer')
      assert.fail()
    } catch (err) {
      res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
      assert.equal(res.status, 200)
      assert.equal(res.data[0].type, 'error')
      // Check that there is an error message in the journal
      assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
    }
  })

  it('Publish a dataset after finalization', async () => {
    const ax = global.ax.dmeadus

    // Prepare a catalog
    const catalog = (await ax.post('/api/v1/catalogs', { url: 'http://test-catalog.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata' })).data

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')

    // Update dataset to ask for a publication
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { publications: [{ catalog: catalog.id, status: 'waiting' }] })
    assert.equal(res.status, 200)

    // Go through the publisher worker
    dataset = await workers.hook('datasetPublisher')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.publications[0].status, 'published')
    assert.equal(dataset.publications[0].targetUrl, 'http://test-catalog.com/datasets/my-dataset')
  })

  it('Process newly uploaded geojson dataset', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-example.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-example.geojson')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('geojsonAnalyzer')
    assert.equal(dataset.status, 'schematized')
    assert.equal(dataset.schema.length, 5)
    const idField = dataset.schema.find(field => field.key === 'id')
    assert.equal(idField.type, 'string')
    assert.equal(idField.format, 'uri-reference')
    const descField = dataset.schema.find(field => field.key === 'desc')
    assert.equal(descField.type, 'string')
    assert.ok(!descField.format)
    const boolField = dataset.schema.find(field => field.key === 'bool')
    assert.equal(boolField.type, 'boolean')

    // ES indexation and finalization
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
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
  it.skip('Process newly uploaded shapefile dataset', async () => {
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

  it('Run tasks in children processes', async function() {
    config.worker.spawnTask = true
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`csvAnalyzer/${res.data.id}`)
    assert.equal(dataset.status, 'analyzed')
    dataset = await workers.hook(`csvSchematizer/${dataset.id}`)
    assert.equal(dataset.status, 'schematized')
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    config.worker.spawnTask = false
  })

  it('Manage failure in children processes', async function() {
    config.worker.spawnTask = true
    const datasetFd = fs.readFileSync('./test/resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken2.geojson')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data
    try {
      await workers.hook(`indexer/${dataset.id}`)
      assert.fail()
    } catch (err) {
      // Check that there is an error message in the journal
      res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
      assert.equal(res.status, 200)
      assert.equal(res.data[0].type, 'error')
      assert.ok(res.data[0].data.includes('100% des lignes sont en erreur'))
    }
    config.worker.spawnTask = false
  })
})
