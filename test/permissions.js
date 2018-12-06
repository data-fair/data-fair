const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)

let datasetId

test.before('prepare resources', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'A dataset' })
  datasetId = res.data.id
  await ax.put('/api/v1/datasets/' + datasetId + '/permissions', [{ type: 'user', id: 'ngernier4', operations: ['readDescription'] }, { type: 'user', id: 'ddecruce5', classes: ['read'] }])
})

test('No permissions', async t => {
  const ax = await axiosBuilder('cdurning2@desdev.cn:passwd')
  try {
    await ax.get('/api/v1/datasets/' + datasetId + '/api-docs.json')
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
})

test('User has permissions on operationId', async t => {
  const ax = await axiosBuilder('ngernier4@usa.gov')
  const res = await ax.get('/api/v1/datasets/' + datasetId)
  t.is(res.status, 200)
})

test('User has permissions on classe', async t => {
  const ax = await axiosBuilder('ddecruce5@phpbb.com')
  const res = await ax.get('/api/v1/datasets/' + datasetId)
  t.is(res.status, 200)
})

test('User can create a dataset for his organization', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'A dataset' }, { headers: { 'x-organizationId': 'KWqAGZ4mG' } })
  t.is(res.status, 201)
  await ax.put('/api/v1/datasets/' + res.data.id + '/permissions', [{ type: 'organization', id: 'KWqAGZ4mG', operations: ['readDescription'] }])
  const axRead = await axiosBuilder('bhazeldean7@cnbc.com')
  res = await axRead.get('/api/v1/datasets/' + res.data.id)
  t.is(res.status, 200)
})
