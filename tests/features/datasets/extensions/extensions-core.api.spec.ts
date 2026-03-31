import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setupMockRoute, clearMockRoutes } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

// Helper to set up geocoder coords mock via the mock server (replaces nock-based setCoordsNock)
const setupCoordsMock = async (latLon: number, opts?: { multiply?: boolean }) => {
  const indexFields = ['matchLevel']
  if (opts?.multiply) indexFields.push('lat', 'lon')
  await setupMockRoute({ path: '/geocoder/coords', ndjsonEcho: { fields: { lat: latLon, lon: latLon, matchLevel: 'match' }, indexFields } })
}

// Helper to set up sirene mock via the mock server (replaces nock-based setSireneNock)
const setupSireneMock = async (fields: Record<string, any>, select: string) => {
  await setupMockRoute({
    path: '/sirene/etablissements_bulk?select=' + select,
    ndjsonEcho: { fields }
  })
}

test.describe('Extensions (core)', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Extend dataset using remote service', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupCoordsMock(10)

    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    const matchLevelProp = dataset.schema.find((field: any) => field.key === extensionKey + '.matchLevel')
    assert.equal(matchLevelProp['x-cardinality'], 2)
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

    // re-order columns and change titles and descriptions
    dataset = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: [
        { ...dataset.schema.find((p: any) => p.key === '_coords.lat'), title: 'Overwritten title lat', description: 'Overwritten description lat' },
        { ...dataset.schema.find((p: any) => p.key === '_coords.lon'), title: 'Overwritten title lon', description: 'Overwritten description lon' },
        ...dataset.schema.filter((p: any) => p.key !== '_coords.lat' && p.key !== '_coords.lon').reverse()
      ]
    }).then(r => r.data)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, '_coords.lat')
    assert.equal(dataset.schema[0].title, 'Overwritten title lat')
    delete dataset.schema[0].title
    dataset = await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema }).then(r => r.data)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, '_coords.lat')
    assert.equal(dataset.schema[0].title, 'Latitude')
    await testSuperadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].key, '_coords.lat')
    assert.equal(dataset.schema[0].title, 'Latitude')

    // Add a line to dataset
    // Re-prepare for extension, it should only process the new line
    await setupCoordsMock(50)
    const form = new FormData()
    let content: string = (await fs.readFile('./tests/resources/datasets/dataset-extensions.csv')).toString()
    content += 'me,3 les noés la chapelle caro\n'
    form.append('file', content, 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
    // A search to check re-indexed results with preserved extensions
    // and new result with new extension
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?select=*`)
    assert.equal(res.data.total, 3)
    const existingResult = res.data.results.find((l: any) => l.label === 'koumoul')
    assert.equal(existingResult[extensionKey + '.lat'], 10)
    assert.equal(existingResult[extensionKey + '.lon'], 10)
    assert.equal(existingResult._geopoint, '10,10')
    const newResult = res.data.results.find((l: any) => l.label === 'me')
    assert.equal(newResult[extensionKey + '.lat'], 50)
    assert.equal(newResult[extensionKey + '.lon'], 50)
    assert.equal(newResult._geopoint, '50,50')
    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 2)

    // Reduce selected output using extension.select
    await setupCoordsMock(40)
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords', select: ['lat', 'lon'] }] })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    // Download extended file
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    const lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '_coords.lat,_coords.lon,adr,label')
    assert.equal(lines[1], '40,40,19 rue de la voie lactée saint avé,koumoul')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 2)

    // perform the extension as a simulation on a pseudo line
    await setupMockRoute({ path: '/geocoder/coords', ndjsonEcho: { fields: { lat: 30, lon: 30 } } })
    res = await ax.post(`/api/v1/datasets/${dataset.id}/_simulate-extension`, { adr: 'test simulation' })
    assert.deepEqual(res.data, { adr: 'test simulation', '_coords.lat': 30, '_coords.lon': 30 })
    await clearMockRoutes()

    // remove the extension
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [] })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(!res.data.find((file: any) => file.key === 'full'))
  })

  test('Extend dataset that was previouly converted', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-extensions.xlsx', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupCoordsMock(10, { multiply: true })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 0)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 0)

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'normalized'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 3)
  })

  test('Extend dataset with different csv parser opts', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-extensions2.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupCoordsMock(10)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)
  })

  test('Extend dataset using another remote service', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-siret-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupSireneMock(
      { NOMEN_LONG: 'KOUMOUL', 'location.lon': '-2.748514', 'location.lat': '47.687173' },
      'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon'
    )
    dataset.schema.find((field: any) => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        type: 'remoteService',
        active: true,
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET',
          'location.lat',
          'location.lon'
        ]
      }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lon'))

    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(dataset.storage.indexed.size, res.data.find((file: any) => file.key === 'full').size)
    assert.equal(dataset.storage.size, res.data.find((file: any) => file.key === 'full').size + res.data.find((file: any) => file.key === 'original').size)
    assert.equal(dataset.storage.indexed.parts.length, 1)
    assert.equal(dataset.storage.indexed.parts[0], 'full-file')
    assert.equal(res.data.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    assert.equal(res.data.trim(), `label,siret,_etablissements.location.lat,_etablissements.location.lon,_etablissements.bodacc.capital,_etablissements.TEFET,_etablissements.NOMEN_LONG
koumoul,82898347800011,47.687173,-2.748514,,,KOUMOUL`)
  })

  test('Manage errors during extension', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    let dataset = await waitForFinalize(ax, res.data.id)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    // The mock route persists, so both the first error (with retry) and the second error (no retry)
    // happen instantly (errorRetryDelay: 0 in dev). We wait for the final error state.
    await setupMockRoute({ path: '/geocoder/coords', status: 500, body: 'some error', contentType: 'text/plain' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForDatasetError(ax, dataset.id)

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'error')
    assert.equal(dataset.errorStatus, 'validated')

    // Check that the journal has both an error-retry and a final error event
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    assert.ok(journal.find((e: any) => e.type === 'error-retry'), 'should have error-retry event in journal')
    assert.ok(journal.find((e: any) => e.type === 'error'), 'should have final error event in journal')

    // Prepare for extension failure with bad body in response
    await setupMockRoute({ path: '/geocoder/coords', status: 200, body: 'some error', contentType: 'text/plain' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, type: 'remoteService', forceNext: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }] })
    assert.equal(res.status, 200)
    dataset = await waitForDatasetError(ax, dataset.id)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'error')
  })

  test('Manage empty queries', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
empty,
`
    form.append('file', content, 'dataset3.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)

    await setupCoordsMock(10)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
  })

  test('Delete extended file when removing extensions', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
`
    form.append('file', content, 'dataset4.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)

    await setupCoordsMock(10)

    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    // check extended file
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    const fullFile = res.data.find((file: any) => file.key === 'full')
    assert.ok(fullFile)
    res = await ax.get(fullFile.url)

    // deactivate extension
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: false, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)

    // check extended file was deleted
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.ok(!res.data.find((file: any) => file.key === 'full'))
    await assert.rejects(
      ax.get(fullFile.url),
      { status: 404 }
    )
  })

  test('Do not add already present concept', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-siret-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupSireneMock(
      { siret: '82898347800011', NOMEN_LONG: 'KOUMOUL', 'location.lon': '-2.748514', 'location.lat': '47.687173' },
      'siret,NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon'
    )
    dataset.schema.find((field: any) => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'siret',
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET',
          'location.lat',
          'location.lon'
        ]
      }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lat'))
    const extSiret = dataset.schema.find((field: any) => field.key === extensionKey + '.siret')
    assert.ok(!extSiret['x-refersTo'])
  })

  test('Extend a REST dataset', async () => {
    const ax = testUser1

    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-extension',
      schema: [{ key: 'address', type: 'string', 'x-refersTo': 'http://schema.org/address' }],
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })).data

    // extend first inserted line
    await setupCoordsMock(10)
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: '19 rue de la voie lactée saint avé' })
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix

    // A search to check results
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

    // extend second inserted line
    await setupCoordsMock(11)
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: 'another address' })
    dataset = await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    const anotherAddress = res.data.results.find((r: any) => r.address === 'another address')
    assert.equal(anotherAddress[extensionKey + '.lat'], 11)
    assert.equal(anotherAddress[extensionKey + '.lon'], 11)

    // remove extension
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [] })
    await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0][extensionKey + '.lat'], undefined)
  })

  test('Remove extensions when input properties got removed', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    let dataset = await waitForFinalize(ax, res.data.id)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    await setupCoordsMock(50)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    await waitForFinalize(ax, dataset.id)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)

    // if we remove the concept, the extension is removed also
    delete dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo']
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('un concept nécessaire'))
      return true
    })
  })

  test('Preserve extension when schema is overwritten at file upload', async () => {
    const ax = testUser1

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    let dataset = await waitForFinalize(ax, res.data.id)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    await setupCoordsMock(50)
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    await waitForFinalize(ax, dataset.id)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)

    const form2 = new FormData()
    form2.append('schema', JSON.stringify(dataset.schema.filter((p: any) => !p['x-calculated'] && !p['x-extension'])))
    form2.append('file', content, 'dataset2.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)
  })

  test('Extend geojson dataset', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset-siret-extensions.geojson', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupSireneMock(
      { NOMEN_LONG: 'KOUMOUL' },
      'NOMEN_LONG,bodacc.capital,TEFET'
    )
    dataset.schema.find((field: any) => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET'
        ]
      }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.NOMEN_LONG'))

    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(dataset.storage.indexed.size, res.data.find((file: any) => file.key === 'full').size)
    assert.equal(res.data.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 1)
    assert.equal(res.data.features[0].properties.Label, 'koumoul')
    assert.equal(res.data.features[0].properties._etablissements.NOMEN_LONG, 'KOUMOUL')
  })
})
