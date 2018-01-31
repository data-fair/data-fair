const fs = require('fs')
const nock = require('nock')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

const workers = require('../server/workers')

const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

test('Extend dataset using remote service', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')

  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)
  const datasetId = res.data.id

  res = await ax.post('/api/v1/remote-services', {
    apiDoc: require('./resources/geocoder-api.json'),
    apiKey: {in: 'header', name: 'x-apiKey'},
    server: 'http://test.com'
  })
  t.is(res.status, 201)
  const remoteServiceId = res.data.id
  await workers.hook('indexer')

  res = await ax.patch('/api/v1/datasets/' + datasetId, {extensions: [{remoteService: remoteServiceId, action: 'postCoords'}]})
  t.is(res.status, 200)
  const dataset = await workers.hook('indexer')
  t.truthy(dataset.schema.find(field => field.key === `_ext_${remoteServiceId}_postCoords._error`))

  nock('http://test.com').post('/coords').reply(200, (uri, requestBody) => {
    return requestBody
      .trim().split('\n').map(JSON.parse)
      .map(item => ({lat: 10, lon: 10, key: item.key}))
      .map(JSON.stringify).join('\n') + '\n'
  })

  res = await ax.post(`/api/v1/datasets/${datasetId}/_extend?remoteService=${remoteServiceId}&action=postCoords`)
  t.is(res.status, 200)
})
