import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setConfig, waitForJournalEvent } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('workers', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Process newly uploaded CSV dataset', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./tests/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = testUser1
    const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    let res = await ax.post('/api/v1/datasets', form, { headers })
    assert.equal(res.status, 201)

    // Wait for finalize (skip intermediate analyzeCsv hook)
    let dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    const idProp = dataset.schema.find((p: any) => p.key === 'id')
    assert.equal(idProp['x-cardinality'], 2)

    // Update schema to specify geo point
    const locProp = dataset.schema.find((p: any) => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)

    // Second ES indexation
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)

    // Reupload data with bad localization
    const datasetFd2 = fs.readFileSync('./tests/resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    const headers2 = { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: headers2 })
    await waitForDatasetError(ax, dataset.id)
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    // Check that there is an error message in the journal
    assert.ok(res.data[0].data.startsWith('100% des lignes sont en erreur'))
  })

  test('Process multiple datasets in parallel worker threads', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    const ax = testUser1
    const datasets = await Promise.all([
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax),
      sendDataset('geo/stations.zip', ax)
    ])
    assert.ok(datasets.find((d: any) => d.slug === 'stations'))
    assert.ok(datasets.find((d: any) => d.slug === 'stations-2'))
    assert.ok(datasets.find((d: any) => d.slug === 'stations-3'))
    assert.ok(datasets.find((d: any) => d.slug === 'stations-4'))
  })

  test('Manage expected failure in children processes', async () => {
    const datasetFd = fs.readFileSync('./tests/resources/geo/geojson-broken.geojson')
    const form = new FormData()
    form.append('file', datasetFd, 'geojson-broken2.geojson')
    const ax = testUser1
    const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    let res = await ax.post('/api/v1/datasets', form, { headers })
    assert.equal(res.status, 201)
    const dataset = res.data
    await waitForDatasetError(ax, dataset.id)
    // Check that there is an error message in the journal
    res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data[0].type, 'error')
    assert.ok(res.data[0].data.includes('100% des lignes sont en erreur'))
  })

  test('Manage bad input in children processes', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'trigger test error 400', schema: [{ key: 'test', type: 'string' }] })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines?async=true`, [{ test: 'test' }])
    await waitForDatasetError(ax, dataset.id)
    // Check that there is an error message in the journal
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[0].data, 'This is a test 400 error')
  })

  test('Manage unexpected failure in children processes', async () => {
    await setConfig('worker.errorRetryDelay', 120)
    try {
      const ax = testUser1
      const form = new FormData()
      form.append('title', 'trigger test error')
      form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset.csv')
      const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
      let dataset = (await ax.post('/api/v1/datasets', form, { headers })).data

      await waitForJournalEvent(dataset.id, 'error-retry')
      let journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data

      assert.equal(journal[0].type, 'error-retry')
      assert.equal(journal[0].data, 'This is a test error')
      dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
      assert.equal(dataset.status, 'error')
      assert.equal(dataset.errorStatus, 'validated')
      assert.ok(dataset.errorRetry)

      await waitForDatasetError(ax, dataset.id)
      journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
      assert.equal(journal[0].type, 'error')
      assert.equal(journal[0].data, 'This is a test error')
      dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
      assert.equal(dataset.status, 'error')
      assert.equal(dataset.errorStatus, 'validated')
      assert.ok(!dataset.errorRetry)
    } finally {
      await setConfig('worker.errorRetryDelay', 0)
    }
  })

  test('Update dataset schema and apply only required worker tasks', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const schema = dataset.schema
    const idProp = schema.find((p: any) => p.key === 'id')

    // changing separator requires a full reindexing
    idProp.separator = ','
    let patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'validated')
    await waitForFinalize(ax, dataset.id)

    // changing capabilities requires reindexing too
    idProp['x-capabilities'] = { insensitive: false }
    patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'validated')
    await waitForFinalize(ax, dataset.id)

    // changing a title does not require any worker tasks
    idProp.title = 'Identifier'
    patchedDataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })).data
    assert.equal(patchedDataset.status, 'finalized')
  })
})
