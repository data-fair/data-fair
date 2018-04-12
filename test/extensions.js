const nock = require('nock')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

const workers = require('../server/workers')

test.serial('Extend dataset using remote service', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  // Initial dataset with addresses
  let form = new FormData()
  let content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
  form.append('file', content, 'dataset.csv')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)
  let dataset = await workers.hook('finalizer')

  // A geocoder remote service
  res = await ax.post('/api/v1/remote-services', {
    apiDoc: require('./resources/geocoder-api.json'),
    apiKey: {in: 'header', name: 'x-apiKey'},
    server: 'http://test.com'
  })
  t.is(res.status, 201)
  const remoteServiceId = res.data.id

  // Prepare for extension using created remote service and patch dataset to ask for it
  let nockScope = nock('http://test.com', {reqheaders: {'x-apiKey': 'test_default_key'}})
    .post('/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      t.is(inputs.length, 2)
      t.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({key: input.key, lat: 10, lon: 10}))
        .map(JSON.stringify).join('\n') + '\n'
    })
  dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
  res = await ax.patch('/api/v1/datasets/dataset', {
    schema: dataset.schema,
    extensions: [{active: true, remoteService: remoteServiceId, action: 'postCoords'}]
  })
  t.is(res.status, 200)
  dataset = await workers.hook('finalizer')
  nockScope.done()
  const extensionKey = `_ext_${remoteServiceId}_postCoords`
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lat'))
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lon'))
  // A search to check results
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 2)
  t.is(res.data.results[0][extensionKey + '.lat'], 10)
  t.is(res.data.results[0][extensionKey + '.lon'], 10)
  t.truthy(res.data.results[0][extensionKey + '._hash'])

  // Add a line to dataset
  // Re-prepare for extension, it should only process the new line
  nockScope = nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    t.is(inputs.length, 1)
    t.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
    return inputs.map(input => ({key: input.key, lat: 50, lon: 50}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  form = new FormData()
  content += 'me,3 les noés la chapelle caro\n'
  form.append('file', content, 'dataset1.csv')
  res = await ax.post('/api/v1/datasets/dataset', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  nockScope.done()
  // A search to check re-indexed results with preserved extensions
  // and new result with new extension
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 3)
  let existingResult = res.data.results.find(l => l.label === 'koumoul')
  t.is(existingResult[extensionKey + '.lat'], 10)
  t.is(existingResult[extensionKey + '.lon'], 10)
  let newResult = res.data.results.find(l => l.label === 'me')
  t.is(newResult[extensionKey + '.lat'], 50)
  t.is(newResult[extensionKey + '.lon'], 50)
  t.is(newResult._geopoint, '50,50')

  // Re process full extension because of forceNext parameter
  nockScope = nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    t.is(inputs.length, 3)
    t.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
    return inputs.map(input => ({key: input.key, lat: 40, lon: 40}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  res = await ax.patch('/api/v1/datasets/dataset', {extensions: [{active: true, forceNext: true, remoteService: remoteServiceId, action: 'postCoords'}]})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  nockScope.done()
  // A search to check re-indexed results with overwritten extensions
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 3)
  existingResult = res.data.results.find(l => l.label === 'koumoul')
  t.is(existingResult[extensionKey + '.lat'], 40)
  t.is(existingResult[extensionKey + '.lon'], 40)
  newResult = res.data.results.find(l => l.label === 'me')
  t.is(newResult[extensionKey + '.lat'], 40)
  t.is(newResult[extensionKey + '.lon'], 40)
  t.is(newResult._geopoint, '40,40')
  dataset = (await ax.get('/api/v1/datasets/dataset')).data
  t.false(dataset.extensions[0].forceNext)
  t.is(dataset.extensions[0].progress, 1)

  // Reduce selected output using extension.select
  res = await ax.patch('/api/v1/datasets/dataset', {extensions: [{active: true, remoteService: remoteServiceId, action: 'postCoords', select: ['lat']}]})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  // A search to check that only lat is present now
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 3)
  existingResult = res.data.results.find(l => l.label === 'koumoul')
  t.is(existingResult[extensionKey + '.lat'], 40)
  t.falsy(existingResult[extensionKey + '.lon'])
  dataset = (await ax.get('/api/v1/datasets/dataset')).data
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lat'))
  t.falsy(dataset.schema.find(field => field.key === extensionKey + '.lon'))

  // Re process full extension with reduced output using extension.select
  nockScope = nock('http://test.com').post('/coords').query({select: 'lat'}).reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    return inputs.map(input => ({key: input.key, lat: 40}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  res = await ax.patch('/api/v1/datasets/dataset', {extensions: [{active: true, forceNext: true, remoteService: remoteServiceId, action: 'postCoords', select: ['lat']}]})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  nockScope.done()
  // A search to check re-indexed results with overwritten extensions
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 3)
  existingResult = res.data.results.find(l => l.label === 'koumoul')
  t.is(existingResult[extensionKey + '.lat'], 40)
  t.falsy(existingResult[extensionKey + '.lon'])
  dataset = (await ax.get('/api/v1/datasets/dataset')).data
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lat'))
  t.falsy(dataset.schema.find(field => field.key === extensionKey + '.lon'))
})

test.serial('Manage errors during extension', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')

  // Initial dataset with addresses
  let form = new FormData()
  let content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
  form.append('file', content, 'dataset2.csv')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)
  await workers.hook('finalizer')

  // A geocoder remote service
  res = await ax.post('/api/v1/remote-services', {
    apiDoc: require('./resources/geocoder-api.json'),
    apiKey: {in: 'header', name: 'x-apiKey'},
    server: 'http://test.com'
  })
  t.is(res.status, 201)
  const remoteServiceId = res.data.id

  // Prepare for extension failure with HTTP error code
  nock('http://test.com').post('/coords').reply(500, 'some error')
  res = await ax.patch('/api/v1/datasets/dataset2', {extensions: [{active: true, remoteService: remoteServiceId, action: 'postCoords'}]})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  let dataset = (await ax.get('/api/v1/datasets/dataset2')).data
  t.truthy(dataset.extensions[0].error)

  // Prepare for extension failure with bad body in response
  nock('http://test.com').post('/coords').reply(200, 'some error')
  res = await ax.patch('/api/v1/datasets/dataset2', {extensions: [{active: true, remoteService: remoteServiceId, action: 'postCoords'}]})
  t.is(res.status, 200)
  await workers.hook('finalizer')
  dataset = (await ax.get('/api/v1/datasets/dataset2')).data
  t.truthy(dataset.extensions[0].error)
})

test('Manage empty queries', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')

  // Initial dataset with addresses
  let form = new FormData()
  let content = `label,adr
koumoul,19 rue de la voie lactée saint avé
empty,
`
  form.append('file', content, 'dataset3.csv')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)
  const dataset = await workers.hook('finalizer')

  // A geocoder remote service
  res = await ax.post('/api/v1/remote-services', {
    apiDoc: require('./resources/geocoder-api.json'),
    apiKey: {in: 'header', name: 'x-apiKey'},
    server: 'http://test.com'
  })
  t.is(res.status, 201)
  const remoteServiceId = res.data.id

  // Prepare for extension failure with HTTP error code
  nock('http://test.com', {reqheaders: {'x-apiKey': 'test_default_key'}})
    .post('/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      t.is(inputs.length, 1)
      return inputs.map(input => ({key: input.key, lat: 10, lon: 10}))
        .map(JSON.stringify).join('\n') + '\n'
    })

  dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
  res = await ax.patch('/api/v1/datasets/dataset3', {
    schema: dataset.schema,
    extensions: [{active: true, remoteService: remoteServiceId, action: 'postCoords'}]
  })
  t.is(res.status, 200)
  await workers.hook('finalizer')
})
