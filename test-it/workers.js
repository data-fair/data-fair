import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'
import * as esUtils from '../api/src/datasets/es/index.ts'

describe('workers', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process newly uploaded CSV dataset', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('analyzeCsv/' + res.data.id)
    assert.equal(dataset.status, 'analyzed')
    const idField = dataset.schema.find(f => f.key === 'id')
    const dateField = dataset.schema.find(f => f.key === 'some_date')
    assert.equal(idField.type, 'string')
    assert.equal(idField.format, undefined)
    assert.equal(dateField.type, 'string')
    assert.equal(dateField.format, 'date')

    // ES indexation and finalization
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    const idProp = dataset.schema.find(p => p.key === 'id')
    assert.equal(idProp['x-cardinality'], 2)
    const esIndices = await es.client.indices.get({ index: esUtils.aliasName(dataset) })
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
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    const esIndices2 = await es.client.indices.get({ index: esUtils.aliasName(dataset) })
    const esIndex2 = Object.values(esIndices2)[0]
    const mapping2 = esIndex2.mappings
    assert.equal(mapping2.properties.id.type, 'keyword')
    assert.equal(mapping2.properties.adr.type, 'keyword')
    assert.equal(mapping2.properties.some_date.type, 'date')
    assert.equal(mapping2.properties.loc.type, 'keyword')
    assert.equal(mapping2.properties._geopoint.type, 'geo_point')

    // Reupload data with bad localization
    const datasetFd2 = fs.readFileSync('./resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    await assert.rejects(workers.hook('indexLines'), () => true)
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    // Check that there is an error message in the journal
    assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
  })

  it('Process multiple datasets in parallel worker threads', async function () {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    this.timeout = 60000
    const ax = dmeadus
    const datasets = await Promise.all([
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax)
    ])
    assert.ok(datasets.find(d => d.slug === 'stations'))
    assert.ok(datasets.find(d => d.slug === 'stations-2'))
    assert.ok(datasets.find(d => d.slug === 'stations-3'))
    assert.ok(datasets.find(d => d.slug === 'stations-4'))
  })

  it('Manage expected failure in children processes', async function () {
    const datasetFd = fs.readFileSync('./resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken2.geojson')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data
    await assert.rejects(workers.hook(`indexLines/${dataset.id}`), () => true)
    // Check that there is an error message in the journal
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    assert.ok(res.data[0].data.includes('100% des lignes sont en erreur'))
  })

  it('Manage bad input in children processes', async function () {
    const ax = dmeadus
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'trigger test error 400', schema: [{ key: 'test', type: 'string' }] })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines?async=true`, [{ test: 'test' }])
    await assert.rejects(workers.hook('indexLines/' + dataset.id), 'This is a test 400 error')
    // Check that there is an error message in the journal
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[0].data, 'This is a test 400 error')
  })

  it('Manage unexpected failure in children processes', async function () {
    config.worker.errorRetryDelay = 120

    const form = new FormData()
    form.append('title', 'trigger test error')
    form.append('file', fs.readFileSync('./resources/datasets/dataset1.csv'), 'dataset.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data

    await assert.rejects(workers.hook('indexLines/' + dataset.id), () => true)
    let journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data

    assert.equal(journal[0].type, 'error-retry')
    assert.equal(journal[0].data, 'This is a test error')
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'validated')
    assert.ok(dataset.errorRetry)

    await assert.rejects(workers.hook('indexLines/' + dataset.id), () => true)
    journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[0].data, 'This is a test error')
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'validated')
    assert.ok(!dataset.errorRetry)

    config.worker.errorRetryDelay = 0
  })

  it('Update dataset schema and apply only required worker tasks', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const schema = dataset.schema
    const idProp = schema.find(p => p.key === 'id')

    // changing separator requires a full redindexing
    idProp.separator = ','
    let patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'validated')
    await workers.hook(`finalize/${dataset.id}`)

    // changing capabilities requires only refinalizing
    idProp['x-capabilities'] = { insensitive: false }
    patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'indexed')
    await workers.hook(`finalize/${dataset.id}`)

    // changing a title does not require any worker tasks
    idProp.title = 'Identifier'
    patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'finalized')
  })
})
