const nock = require('nock')
const fs = require('fs-extra')
const assert = require('assert').strict
const FormData = require('form-data')
const config = require('config')
const eventToPromise = require('event-to-promise')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')
describe('Extensions', () => {
  it('Extend dataset using remote service', async function() {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    let nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 2)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })
    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lon'))
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

    // Add a line to dataset
    // Re-prepare for extension, it should only process the new line
    nockScope = nock('http://test.com').post('/geocoder/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 1)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 50, lon: 50 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    const form = new FormData()
    let content = await fs.readFile('test/resources/datasets/dataset-extensions.csv')
    content += 'me,3 les noés la chapelle caro\n'
    form.append('file', content, 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
    await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    // A search to check re-indexed results with preserved extensions
    // and new result with new extension
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?select=*`)
    assert.equal(res.data.total, 3)
    const existingResult = res.data.results.find(l => l.label === 'koumoul')
    assert.equal(existingResult[extensionKey + '.lat'], 10)
    assert.equal(existingResult[extensionKey + '.lon'], 10)
    assert.equal(existingResult._geopoint, '10,10')
    const newResult = res.data.results.find(l => l.label === 'me')
    assert.equal(newResult[extensionKey + '.lat'], 50)
    assert.equal(newResult[extensionKey + '.lon'], 50)
    assert.equal(newResult._geopoint, '50,50')

    // Reduce selected output using extension.select
    nockScope = nock('http://test.com').post('/geocoder/coords?select=lat,lon').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 3)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 40, lon: 40 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords', select: ['lat', 'lon'] }] })
    console.log(res.data.extensions)
    assert.equal(res.status, 200)
    await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()

    // Download extended file
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    const lines = res.data.split('\n')
    assert.equal(lines[0].trim(), 'label,adr,coords.lat,coords.lon')
    assert.equal(lines[1], 'koumoul,19 rue de la voie lactée saint avé,40,40')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find(file => file.key === 'original'))
    assert.ok(res.data.find(file => file.key === 'full'))
    assert.equal(res.data.length, 2)
  })

  it('Extend dataset that was previouly converted', async function() {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-extensions.xlsx', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    const nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 3)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map((input, i) => ({ key: input.key, lat: 10 * i, lon: 10 * i }))
          .map(JSON.stringify).join('\n') + '\n'
      })
    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lon'))
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 0)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 0)

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find(file => file.key === 'original'))
    assert.ok(res.data.find(file => file.key === 'normalized'))
    assert.ok(res.data.find(file => file.key === 'full'))
    if (process.env.TIPPECANOE_SKIP !== 'true') {
      assert.ok(res.data.find(file => file.key === 'mbtiles'))
      assert.equal(res.data.length, 4)
    } else {
      assert.equal(res.data.length, 3)
    }
  })

  it('Extend dataset with different csv parser opts', async function() {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-extensions2.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    const nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 2)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })
    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lat'))
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.lon'))
    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)
  })

  it('Extend dataset using another remote service', async function() {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-siret-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    const nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
      .post('/sirene/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon')
      // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
      .reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
        return JSON.stringify({
          NOMEN_LONG: 'KOUMOUL',
          'location.lon': '-2.748514',
          'location.lat': '47.687173',
          key: inputs[0].key,
        }) + '\n'
      })
    dataset.schema.find(field => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET',
          'location.lat',
          'location.lon',
        ],
      }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.location.lat'))
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.location.lon'))

    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find(file => file.key === 'original'))
    assert.ok(res.data.find(file => file.key === 'full'))
    assert.equal(dataset.storage.fileSize, res.data.find(file => file.key === 'full').size)
    assert.equal(res.data.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    assert.equal(res.data.trim(), `label,siret,etablissements.location.lat,etablissements.location.lon,etablissements.bodacc.capital,etablissements.TEFET,etablissements.NOMEN_LONG
koumoul,82898347800011,47.687173,-2.748514,,,KOUMOUL`)
  })

  it('Manage errors during extension', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    nock('http://test.com').post('/geocoder/coords').reply(500, 'some error')
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    try {
      await workers.hook('extender')
      assert.fail()
    } catch (err) {
      assert.equal(err.message, '500 - some error')
    }

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'error')

    // Prepare for extension failure with bad body in response
    nock('http://test.com').post('/geocoder/coords').reply(200, 'some error')
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { extensions: [{ active: true, forceNext: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }] })
    assert.equal(res.status, 200)
    try {
      await workers.hook('extender')
      assert.fail()
    } catch (err) {
      assert.ok(err.message.startsWith('Unexpected token s'))
    }
    dataset = (await ax.get('/api/v1/datasets/dataset2')).data
    assert.equal(dataset.status, 'error')
  })

  it('Manage empty queries', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
empty,
`
    form.append('file', content, 'dataset3.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook(`finalizer/${res.data.id}`)

    nock('http://test.com', { reqheaders: { 'x-apiKey': 'test_default_key' } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })

    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    await workers.hook('finalizer')
  })

  it('Delete extended file when removing extensions', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
`
    form.append('file', content, 'dataset4.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook(`finalizer/${res.data.id}`)

    nock('http://test.com', { reqheaders: { 'x-apiKey': 'test_default_key' } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })

    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    await workers.hook('finalizer')

    // check extended file
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    const fullFile = res.data.find(file => file.key === 'full')
    assert.ok(fullFile)
    res = await ax.get(fullFile.url)

    // deactivate extension
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: false, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    assert.equal(res.status, 200)
    await workers.hook('finalizer')

    // check extended file was deleted
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.ok(!res.data.find(file => file.key === 'full'))
    try {
      res = await ax.get(fullFile.url)
      assert.fail()
    } catch (err) {
      assert.ok(err.status, 404)
    }
  })

  it('Do not add already present concept', async () => {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-siret-extensions.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    const nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
      .post('/sirene/etablissements_bulk?select=siret,NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon')
      // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
      .reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
        return JSON.stringify({
          siret: '82898347800011',
          NOMEN_LONG: 'KOUMOUL',
          'location.lon': '-2.748514',
          'location.lat': '47.687173',
          key: inputs[0].key,
        }) + '\n'
      })
    dataset.schema.find(field => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'siret',
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET',
          'location.lat',
          'location.lon',
        ],
      }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.location.lat'))
    const extSiret = dataset.schema.find(field => field.key === extensionKey + '.siret')
    assert.ok(!extSiret['x-refersTo'])
  })

  it('Extend a REST dataset', async () => {
    const ax = global.ax.dmeadus

    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-extension',
      schema: [{ key: 'address', type: 'string', 'x-refersTo': 'http://schema.org/address' }],
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })).data
    await workers.hook(`finalizer/${dataset.id}`)

    // extend first inserted line
    let nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: '19 rue de la voie lactée saint avé' })
    let inputsEvent = await eventToPromise(global.events, 'extension-inputs')
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    // console.log(dataset)

    // A search to check results
    const extensionKey = dataset.extensions[0].shortId
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0][extensionKey + '.lat'], 10)
    assert.equal(res.data.results[0][extensionKey + '.lon'], 10)

    // extend second inserted line
    nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      .post('/geocoder/coords').reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
        return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
          .map(JSON.stringify).join('\n') + '\n'
      })
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { address: 'unknown address' })
    inputsEvent = await eventToPromise(global.events, 'extension-inputs')
    assert.equal(inputsEvent, 1)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
  })

  it('Remove extensions when input properties got removed', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    const nockScope = nock('http://test.com').post('/geocoder/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 2)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 50, lon: 50 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    })
    await workers.hook(`extender/${dataset.id}`)
    nockScope.done()
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 11)

    // if we remove the concept, the extension is removed also
    delete dataset.schema.find(field => field.key === 'adr')['x-refersTo']
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })).data
    assert.equal(dataset.schema.length, 6)
    /* await workers.hook(`extender/${dataset.id}`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.extensions.length, 0) */
  })

  it('Extend geojson dataset', async function() {
    const ax = global.ax.dmeadus
    // Initial dataset with addresses
    let dataset = await testUtils.sendDataset('datasets/dataset-siret-extensions.geojson', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    const nockScope = nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
      // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
      .post('/sirene/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET')
      // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
      .reply(200, (uri, requestBody) => {
        const inputs = requestBody.trim().split('\n').map(JSON.parse)
        assert.equal(inputs.length, 1)
        assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
        return JSON.stringify({
          NOMEN_LONG: 'KOUMOUL',
          key: inputs[0].key,
        }) + '\n'
      })
    dataset.schema.find(field => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        remoteService: 'sirene-koumoul',
        action: 'findEtablissementsBulk',
        select: [
          'NOMEN_LONG',
          'bodacc.capital',
          'TEFET',
        ],
      }],
    })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    nockScope.done()
    const extensionKey = dataset.extensions[0].shortId
    assert.ok(dataset.schema.find(field => field.key === extensionKey + '.NOMEN_LONG'))

    // A search to check results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'koumoul')
    assert.equal(res.data.results[0][extensionKey + '.NOMEN_LONG'], 'KOUMOUL')

    // list generated files
    res = await ax.get(`/api/v1/datasets/${dataset.id}/data-files`)
    assert.equal(res.status, 200)
    assert.ok(res.data.find(file => file.key === 'original'))
    assert.ok(res.data.find(file => file.key === 'full'))
    assert.equal(dataset.storage.fileSize, res.data.find(file => file.key === 'full').size)
    assert.equal(res.data.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 1)
    assert.equal(res.data.features[0].properties.label, 'koumoul')
    assert.equal(res.data.features[0].properties.etablissements.NOMEN_LONG, 'KOUMOUL')
  })
})
