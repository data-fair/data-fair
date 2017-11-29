const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const [test] = testUtils.prepare('datasets', 5606)

test('Get datasets when not authenticated', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/datasets')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Failure to get datasets with bad auth', async t => {
  const ax = await testUtils.axios()
  try {
    await ax.get('/api/v1/datasets', {headers: {Authorization: 'badtoken'}})
    t.fail()
  } catch (err) {
    t.is(err.response.status, 401)
  }
})

test('Get datasets when authenticated', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.get('/api/v1/datasets')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

test('Upload new dataset in user zone', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const form = new FormData()
  form.append('owner[type]', 'user')
  form.append('owner[id]', 'dmeadus0')
  form.append('file', datasetFd, 'dataset1.csv')
  const res = await ax.post('/api/v1/datasets', form, {headers: form.getHeaders()})
  t.is(res.status, 201)
})

test('Upload new dataset in organization zone', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const form = new FormData()
  form.append('owner[type]', 'organization')
  form.append('owner[id]', 'KWqAGZ4mG')
  form.append('file', datasetFd, 'dataset2.csv')
  const res = await ax.post('/api/v1/datasets', form, {headers: form.getHeaders()})
  t.is(res.status, 201)
})

test('Fail to upload new dataset when not authenticated', async t => {
  const ax = await testUtils.axios()
  const form = new FormData()
  try {
    await ax.post('/api/v1/datasets', form, {headers: form.getHeaders()})
    t.fail()
  } catch (err) {
    t.is(err.response.status, 401)
  }
})
