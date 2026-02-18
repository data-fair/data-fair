import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import nock from 'nock'
import fs from 'fs-extra'
import FormData from 'form-data'
import config from 'config'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import dayjs from 'dayjs'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, superadmin, sendDataset, formHeaders } from './utils/index.ts'

describe('Extensions', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Extend dataset using remote service', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-extensions.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({ nbInputs: 2, latLon: 10 }, { name: 'setCoordsNock' })

    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    const matchLevelProp = dataset.schema.find((field: any) => field.key === extensionKey + '.matchLevel')
    assert.equal(matchLevelProp['x-cardinality'], 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

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
    await superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.schema[0].key, '_coords.lat')
    assert.equal(dataset.schema[0].title, 'Latitude')

    await workers.workers.batchProcessor.run({ nbInputs: 1, latLon: 50 }, { name: 'setCoordsNock' })
    const form = new FormData()
    const csvContent = await fs.readFile('test-it/resources/datasets/dataset-extensions.csv', 'utf-8')
    const content = csvContent + 'me,3 les noés la chapelé caro\n'
    form.append('file', content, 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: formHeaders(form) })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)
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
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 2)

    await workers.workers.batchProcessor.run({ nbInputs: 3, latLon: 40, query: '?select=lat,lon' }, { name: 'setCoordsNock' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords', select: ['lat', 'lon'] }] })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    const lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '_coords.lat,_coords.lon,adr,label')
    assert.equal(lines[1], '40,40,19 rue de la voie lactée saint avé,koumoul')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 2)

    nock('http://test.com').post('/geocoder/coords?select=lat,lon').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 1)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map((input: any) => ({ key: input.key, lat: 30, lon: 30 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    res = await ax.post(`/api/v1/datasets/${dataset.id}/_simulate-extension`, { adr: 'test simulation' })
    assert.deepEqual(res.data, { adr: 'test simulation', '_coords.lat': 30, '_coords.lon': 30 })

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [] })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(!res.data.find((file: any) => file.key === 'full'))
  })

  it('Extend dataset that was previously converted', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-extensions.xlsx', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({ nbInputs: 3, latLon: 10, multiply: true }, { name: 'setCoordsNock' })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 0)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 0)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find((file: any) => file.key === 'original'))
    assert.ok(res.data.find((file: any) => file.key === 'normalized'))
    assert.ok(res.data.find((file: any) => file.key === 'full'))
    assert.equal(res.data.length, 3)
  })

  it('Extend dataset with different csv parser opts', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-extensions2.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({ nbInputs: 2, latLon: 10 }, { name: 'setCoordsNock' })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.lon'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)
  })

  it('Extend dataset using another remote service', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-siret-extensions.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({}, { name: 'setSireneNock' })
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
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lat'))
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lon'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

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

  it('Manage errors during extension', async function () {
    const ax = dmeadus

    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    const nockInfo1 = { origin: 'http://test.com', method: 'post', path: '/geocoder/coords', reply: { status: 500, body: 'some error' } }
    await workers.workers.batchProcessor.run(nockInfo1, { name: 'setNock' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook('extend/' + dataset.id), { message: '500 - some error' })

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'error')
    assert.ok(dataset.errorRetry)
    assert.equal(dataset.errorStatus, 'validated')

    await workers.workers.batchProcessor.run(nockInfo1, { name: 'setNock' })
    await assert.rejects(workers.hook('extend/' + dataset.id), { message: '500 - some error' })

    await workers.workers.batchProcessor.run({ origin: 'http://test.com', method: 'post', path: '/geocoder/coords', reply: { status: 200, body: 'some error' } }, { name: 'setNock' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, type: 'remoteService', forceNext: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }] })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook('extend/' + dataset.id), { message: /Unexpected token/ })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'error')
  })

  it('Manage empty queries', async function () {
    const ax = dmeadus

    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
empty,
`
    form.append('file', content, 'dataset3.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook(`finalize/${res.data.id}`)

    await workers.workers.batchProcessor.run({ nbInputs: 1, latLon: 10 }, { name: 'setCoordsNock' })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await workers.hook('finalize/' + dataset.id)
  })

  it('Delete extended file when removing extensions', async function () {
    const ax = dmeadus

    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
`
    form.append('file', content, 'dataset4.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook(`finalize/${res.data.id}`)

    await workers.workers.batchProcessor.run({ nbInputs: 1, latLon: 10 }, { name: 'setCoordsNock' })

    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await workers.hook('finalize/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    const fullFile = res.data.find((file: any) => file.key === 'full')
    assert.ok(fullFile)
    res = await ax.get(fullFile.url)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: false, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    assert.equal(res.status, 200)
    await workers.hook('finalize/' + dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.ok(!res.data.find((file: any) => file.key === 'full'))
    try {
      res = await ax.get(fullFile.url)
      assert.fail()
    } catch (err: any) {
      assert.equal(err.response?.status || err.status, 404)
    }
  })

  it('Do not add already present concept', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-siret-extensions.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({}, { name: 'setSireneNock2' })
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
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.location.lat'))
    const extSiret = dataset.schema.find((field: any) => field.key === extensionKey + '.siret')
    assert.ok(!extSiret['x-refersTo'])
  })

  it('Extend a REST dataset', async function () {
    const ax = dmeadus
    const testConfig = config as any

    const getExtensionNock = (result: any) => nock('http://test.com', { reqheaders: { 'x-apiKey': testConfig.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map((input: any) => ({ key: input.key, ...result }))
          .map(JSON.stringify).join('\n') + '\n'
      })

    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-extension',
      schema: [{ key: 'address', type: 'string', 'x-refersTo': 'http://schema.org/address' }],
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })).data

    const workers = await import('../api/src/workers/index.ts')
    const testEvents = await import('../api/src/misc/utils/test-events.ts')

    let nockScope = getExtensionNock({ lat: 10, lon: 10 })
    let [, inputsEvent] = await Promise.all([
      ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: '19 rue de la voie lactée saint avé' }),
      eventPromise(testEvents.default, 'extension-inputs')
    ])
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    nockScope.done()

    const extensionKey = dataset.extensions[0].propertyPrefix
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

    nockScope = getExtensionNock({ lat: 11, lon: 11 });
    [, inputsEvent] = await Promise.all([
      ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: 'another address' }),
      eventPromise(testEvents.default, 'extension-inputs')
    ])
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    nockScope.done()
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    const anotherAddress = res.data.results.find((r: any) => r.address === 'another address')
    assert.equal(anotherAddress[extensionKey + '.lat'], 11)
    assert.equal(anotherAddress[extensionKey + '.lon'], 11)

    nockScope = getExtensionNock({ error: 'unknown' });
    [, inputsEvent] = await Promise.all([
      ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: 'unknown address' }),
      eventPromise(testEvents.default, 'extension-inputs')
    ])
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    nockScope.done()
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    const unknownAddress = res.data.results.find((r: any) => r.address === 'unknown address')
    assert.equal(unknownAddress[extensionKey + '.error'], 'unknown');

    [, inputsEvent] = await Promise.all([
      ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: 'another address' }),
      eventPromise(testEvents.default, 'extension-inputs')
    ])
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    const anotherAddress2 = res.data.results.sort((a: any, b: any) => b._i - a._i)[0]
    assert.equal(anotherAddress2[extensionKey + '.lat'], 11)
    assert.equal(anotherAddress2[extensionKey + '.lon'], 11)

    nockScope = getExtensionNock({ lat: 12, lon: 12 });
    [, inputsEvent] = await Promise.all([
      ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ _id: anotherAddress2._id, address: 'yet another address' }]),
      eventPromise(testEvents.default, 'extension-inputs')
    ])
    dataset = await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    const anotherAddress3 = res.data.results.sort((a: any, b: any) => b._i - a._i)[0]
    assert.equal(anotherAddress3[extensionKey + '.lat'], 12)
    assert.equal(anotherAddress3[extensionKey + '.lon'], 12)

    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: []
    })
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0][extensionKey + '.lat'], undefined)
  })

  it('Remove extensions when input properties got removed', async function () {
    const ax = dmeadus

    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    await workers.workers.batchProcessor.run({ nbInputs: 2, latLon: 50 }, { name: 'setCoordsNock' })

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    await workers.hook(`extend/${dataset.id}`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)

    delete dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo']
    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('un concept nécessaire'))
      return true
    })
  })

  it('Preserve extension when schema is overwritten at file upload', async function () {
    const ax = dmeadus

    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    await workers.workers.batchProcessor.run({ nbInputs: 2, latLon: 50 }, { name: 'setCoordsNock' })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
    })
    await workers.hook(`extend/${dataset.id}`)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)

    const form2 = new FormData()
    form2.append('schema', JSON.stringify(dataset.schema.filter((p: any) => !p['x-calculated'] && !p['x-extension'])))
    form2.append('file', content, 'dataset2.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${res.data.id}`)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)
  })

  it('Extend geojson dataset', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset-siret-extensions.geojson', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({}, { name: 'setSireneNock3' })
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
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const extensionKey = dataset.extensions[0].propertyPrefix
    assert.ok(dataset.schema.find((field: any) => field.key === extensionKey + '.NOMEN_LONG'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

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

  it('Extend dataset using expression', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'calc1', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, 'koumoul - 19 rue de la voie lactée saint avé')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue')
  })

  it('Extend dataset using static value expression and x-originalName', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: '"Test"', property: { 'x-originalName': 'Test', key: 'test', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find((field: any) => field.key === 'test'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].test, 'Test')
    assert.equal(res.data.results[1].test, 'Test')
  })

  it('Extend dataset using more complex expression', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'f(item) = item != "koumoul"; join(" - ", filter(f, [id, adr]))', property: { key: 'calc1', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, '19 rue de la voie lactée saint avé')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue')
  })

  it('Extend dataset using expression referencing column from another extension', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({ nbInputs: 2, latLon: 10, multiply: true }, { name: 'setCoordsNock' })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' },
        { active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr, " - ", _coords.matchLevel)', property: { key: 'calc1', type: 'string' } }
      ]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, 'koumoul - 19 rue de la voie lactée saint avé - match0')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue - match1')
  })

  it('Manage some errors in expressions', async function () {
    const ax = dmeadus
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest dataset',
      schema: [{ key: 'str1', 'x-originalName': 'Str1', type: 'string' }, { key: 'str2', type: 'string' }]
    })).data

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", str1', property: { key: 'calc1', type: 'string' } }]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('unexpected TEOF'))
      return true
    })

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", Str1)', property: { key: 'calc1', type: 'string' } }]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('la clé de la colonne Str1 est str1'))
      return true
    })

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [
        { active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", calc2)', property: { key: 'calc1', type: 'string' } },
        { active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", str1)', property: { key: 'calc2', type: 'string' } }
      ]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('la colonne calc2 est définie par une extension qui est appliquée après cette expression'))
      return true
    })
  })

  it('Fail to add extension with duplicate key', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.schema.find((field: any) => field.key === 'employees'))

    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset2.csv'), 'dataset2.csv')
    dataset = (await ax.put(`/api/v1/datasets/${dataset.id}`, form, { headers: formHeaders(form), params: { draft: true } })).data

    await assert.rejects(workers.hook(`finalize/${dataset.id}`), (err: any) => {
      assert.equal(err.message, '[noretry] Une extension essaie de créer la colonne "employees" mais cette clé est déjà utilisée.')
      return true
    })
  })

  it('Update a single extension on file dataset should trigger full reindexing', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    const workers = await import('../api/src/workers/index.ts')
    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " / ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    assert.equal(res.data.status, 'validated')
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].employees, 'koumoul / 19 rue de la voie lactée saint avé')
  })

  it('Update a single extension on Rest dataset should NOT trigger full reindexing', async function () {
    const ax = dmeadus
    const today = dayjs().format('DD/MM/YYYY')
    const restDatasetsUtils = await import('../api/src/datasets/utils/rest.ts')
    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest dataset',
      schema: [{ key: 'str1', type: 'string' }, { key: 'str2', type: 'string' }],
      extensions: [{
        active: true,
        type: 'exprEval',
        expr: 'CONCAT(str1, " - ", str2, " - ", TRANSFORM_DATE(_updatedAt, "", "DD/MM/YYYY"))',
        property: { key: 'exp', type: 'string' }
      }]
    })).data
    const workers = await import('../api/src/workers/index.ts')
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ str1: 'str 1', str2: 'str 2' }, { str1: 'UPPER STR 1', str2: 'UPPER STR 2' }])
    await workers.hook(`finalize/${dataset.id}`)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].exp, 'UPPER STR 1 - UPPER STR 2 - ' + today)
    assert.equal(lines[1].exp, 'str 1 - str 2 - ' + today)
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'UPPER(CONCAT(str1, " - ", str2, " - ", TRANSFORM_DATE(_updatedAt, "", "DD/MM/YYYY")))', property: { key: 'exp', type: 'string' } }]
    })
    assert.equal(res.data.status, 'finalized')
    assert.equal(res.data.extensions[0].needsUpdate, true)
    await workers.hook(`extend/${dataset.id}`)
    const collection = restDatasetsUtils.collection(dataset)
    const needsIndexingLines = await collection.find({ _needsIndexing: true }).toArray()
    assert.equal(needsIndexingLines.length, 1)
    assert.equal(needsIndexingLines[0].str1, 'str 1')
    assert.equal(needsIndexingLines[0].exp, 'STR 1 - STR 2 - ' + today)
    dataset = await workers.hook(`finalize/${dataset.id}`)
  })

  it('Manage cases where extension returns wrong type', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const workers = await import('../api/src/workers/index.ts')

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '"value"', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`), { message: "[noretry] échec de l'évaluation de l'expression \"\"value\"\" : /calc1 doit être de type number (résultat : \"value\")" })

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1.1', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, 1.1)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1.1', property: { key: 'calc1', type: 'integer' } }
      ]
    })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, 1)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1', property: { key: 'calc1', type: 'string' } }
      ]
    })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, '1')

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '[[1],[2]]', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`), { message: "[noretry] échec de l'évaluation de l'expression \"[[1],[2]]\" : /calc1 doit être de type number (résultat : [[1],[2]])" })

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '"wrongDate"', property: { key: 'calc1', type: 'string', format: 'date-time' } }
      ]
    })
    assert.equal(res.status, 200)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`), { message: "[noretry] échec de l'évaluation de l'expression \"\"wrongDate\"\" : /calc1 doit correspondre au format \"date-time\" (date-time) (résultat : \"wrongDate\")" })
  })
})
