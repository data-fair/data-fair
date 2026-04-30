import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, waitForDatasetError, fileExists, setupMockRoute, clearMockRoutes, getRawDataset, clearDatasetCache } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// Paths passed to fileExists() are resolved relative to the server's dataDir
const dataDir = '.'

test.describe('datasets in draft mode - advanced', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Create a draft with attachments', async () => {
    const ax = testUser1

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization of draft
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'draft')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test', draft: true, thumbnail: true } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._attachment_url.endsWith('?draft=true'))
    assert.ok(res.data.results[0]._thumbnail.endsWith('?width=300&height=200&draft=true'))
    res = await ax.get(res.data.results[1]._attachment_url)
    assert.equal(res.status, 200)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
  })

  test('Create a draft with attachments then data uploaded separately', async () => {
    const ax = testUser1

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)

    // update only the attachments
    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./tests/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    dataset = await waitForDatasetError(ax, dataset.id, { draft: true })
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'stored')
    assert.ok(!dataset.errorRetry)

    // then update the data
    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Create a draft with data then attachments uploaded separately', async () => {
    const ax = testUser1

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)

    // update only the data (not the attachments)
    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')

    // the update the attachments
    const form3 = new FormData()
    form3.append('attachments', fs.readFileSync('./tests/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')

    // finally validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Create a draft of a geo file that requires conversion', async () => {
    test.skip(!!process.env.OGR2OGR_SKIP, 'ogr2ogr not available in this environment')
    // Send dataset
    const datasetFd = fs.readFileSync('./tests/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)

    let dataset = await waitForFinalize(ax, res.data.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 86)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 86)

    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 86)
    assert.equal(lines.results.length, 12)
    assert.ok(lines.next)
    assert.equal(lines.results[0]._i, 1)
    assert.equal(lines.results[1]._i, 2)
    lines = (await ax.get(lines.next)).data
    assert.equal(lines.results.length, 12)
    assert.ok(lines.next)
    assert.equal(lines.results[0]._i, 13)
    assert.equal(lines.results[1]._i, 14)
  })

  test('Manage error status in draft mode', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    dataset.draft.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    await setupMockRoute({ path: '/geocoder/coords', status: 500, body: 'some error' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    dataset = await waitForDatasetError(ax, dataset.id, { draft: true })
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'validated')
  })

  test('Fails when draft file is missing the input properties', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, res.data.id)
    // Fetch with draft=true to get draft schema merged into main (API strips draft field)
    let dataset = (await ax.get(`/api/v1/datasets/${res.data.id}`, { params: { draft: true } })).data
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension
    await setupMockRoute({ path: '/geocoder/coords', ndjsonEcho: { fields: { lat: 10, lon: 10, matchLevel: 'match' }, indexFields: ['matchLevel'] } })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema.length, 11)

    // load a file missing the address property
    const form2 = new FormData()
    const content2 = `label
koumoul
other
`
    form2.append('file', content2, 'dataset2-noadr.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 200)
    await waitForDatasetError(ax, dataset.id, { draft: true })
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent)
    assert.ok(errorEvent.data.includes('un concept nécessaire'))
  })

  test('Delete a dataset in draft state', async () => {
    const ax = testUser1

    // Send dataset
    const datasetFd = fs.readFileSync('./tests/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)

    assert.ok(await fileExists(`${dataDir}/user/test_user1/datasets-drafts/${dataset.id}`))
    assert.ok(!await fileExists(`${dataDir}/user/test_user1/datasets/${dataset.id}`))
    res = await ax.delete('/api/v1/datasets/' + dataset.id)
    assert.ok(!await fs.pathExists(`${dataDir}/user/test_user1/datasets-drafts/${dataset.id}`))
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}`), (err: any) => err.status === 404)
  })

  test('Accepts a new file with compatible keys but different names', async () => {
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1-names.csv'), 'dataset1.csv')
    const ax = testUser1
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'Id')
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule 2')
    let csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"Id","Adr"'))

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    dataset = await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() }, params: { draft: true } })
    })
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.schema[0]['x-originalName'], 'id')
    assert.equal(dataset.file.schema[0].key, 'id')
    assert.equal(dataset.file.schema[0]['x-originalName'], 'id')
    await clearDatasetCache()
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[1].id, 'bidule')
    csv = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines?format=csv')).data
    assert.ok(csv.startsWith('"id","adr"'))
  })
})
