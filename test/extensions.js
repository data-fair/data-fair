const nock = require('nock')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

const workers = require('../server/workers')

test('Extend dataset using remote service', async t => {
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
  await workers.hook('indexer')

  // A geocoder remote service
  res = await ax.post('/api/v1/remote-services', {
    apiDoc: require('./resources/geocoder-api.json'),
    apiKey: {in: 'header', name: 'x-apiKey'},
    server: 'http://test.com'
  })
  t.is(res.status, 201)
  const remoteServiceId = res.data.id

  // Patch dataset to add extension using created remote service
  res = await ax.patch('/api/v1/datasets/dataset', {extensions: [{remoteService: remoteServiceId, action: 'postCoords'}]})
  t.is(res.status, 200)
  const dataset = await workers.hook('indexer')
  const extensionKey = `_ext_${remoteServiceId}_postCoords`
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '._error'))
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lat'))
  t.truthy(dataset.schema.find(field => field.key === extensionKey + '.lon'))

  // Perform extension
  nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    t.is(inputs.length, 2)
    t.deepEqual(Object.keys(inputs[0]), ['key'])
    return inputs.map(input => ({key: input.key}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  res = await ax.post(`/api/v1/datasets/dataset/_extend?remoteService=${remoteServiceId}&action=postCoords`)
  t.is(res.status, 200)

  // A search to check results
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 2)
  t.truthy(res.data.results[0][extensionKey])

  // Patch dataset to add concept useful for extension
  dataset.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
  res = await ax.patch('/api/v1/datasets/dataset', {schema: dataset.schema})
  await workers.hook('indexer')

  // Re-perform extension
  nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    t.is(inputs.length, 2)
    t.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
    return inputs.map(input => ({key: input.key, lat: 10, lon: 10}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  res = await ax.post(`/api/v1/datasets/dataset/_extend?remoteService=${remoteServiceId}&action=postCoords`)
  t.is(res.status, 200)

  // A search to check results
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 2)
  t.truthy(res.data.results[0][extensionKey].lat)
  t.truthy(res.data.results[0][extensionKey].lon)
  t.truthy(res.data.results[0][extensionKey]._hash)

  // Add a line to dataset
  form = new FormData()
  content += 'me,3 les noés la chapelle caro\n'
  form.append('file', content, 'dataset1.csv')
  res = await ax.post('/api/v1/datasets/dataset', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 200)
  await workers.hook('indexer')

  // A search to check re-indexed results with preserved extensions
  res = await ax.get(`/api/v1/datasets/dataset/lines`)
  t.is(res.data.total, 3)
  const existingResult = res.data.results.find(l => l.label === 'koumoul')
  t.truthy(existingResult[extensionKey])
  const newResult = res.data.results.find(l => l.label === 'me')
  t.falsy(newResult[extensionKey])

  // Re-perform extension with keep=true
  // it should only process the new line
  nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    const inputs = requestBody.trim().split('\n').map(JSON.parse)
    t.is(inputs.length, 1)
    t.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
    return inputs.map(input => ({key: input.key, lat: 10, lon: 10}))
      .map(JSON.stringify).join('\n') + '\n'
  })
  res = await ax.post(`/api/v1/datasets/dataset/_extend?remoteService=${remoteServiceId}&action=postCoords&keep=true`)
  t.is(res.status, 200)
})
