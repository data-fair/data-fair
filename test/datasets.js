const fs = require('fs')
const FormData = require('form-data')
const eventToPromise = require('event-to-promise')
const WebSocket = require('ws')
const testUtils = require('./resources/test-utils')

const { test, config, axiosBuilder } = testUtils.prepare(__filename)

let notifier
test.before('prepare notifier', async t => {
  notifier = require('./resources/app-notifier.js')
  await eventToPromise(notifier, 'listening')
})

test('Get datasets when not authenticated', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/datasets')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Get datasets when authenticated', async t => {
  const ax = await axiosBuilder('alone@no.org')
  const res = await ax.get('/api/v1/datasets')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

test('Failure to upload dataset exceeding limit', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const form = new FormData()
  form.append('file', Buffer.alloc(16000), 'largedataset.csv')
  try {
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 413)
  }
})

test('Failure to upload multiple datasets exceeding limit', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let form = new FormData()
  form.append('file', Buffer.alloc(11000), 'largedataset1.csv')
  await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })

  form = new FormData()
  form.append('file', Buffer.alloc(11000), 'largedataset2.csv')
  try {
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 429)
  }
})

test('Upload new dataset in user zone', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  t.is(res.data.owner.type, 'user')
  t.is(res.data.owner.id, 'dmeadus0')
  t.is(res.data.file.encoding, 'UTF-8')
})

test('Upload new dataset in organization zone', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset2.csv')
  const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
  t.is(res.status, 201)
  t.is(res.data.owner.type, 'organization')
  t.is(res.data.owner.id, 'KWqAGZ4mG')
})

test('Uploading same file twice should increment id', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  for (let i of [1, 2, 3]) {
    const form = new FormData()
    form.append('file', datasetFd, 'my-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
    t.is(res.status, 201)
    t.is(res.data.id, 'my-dataset' + (i === 1 ? '' : i))
  }
})

test('Fail to upload new dataset when not authenticated', async t => {
  const ax = await axiosBuilder()
  const form = new FormData()
  try {
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 401)
  }
})

test('Upload dataset - full test with webhooks', async t => {
  const wsCli = new WebSocket(config.publicUrl)
  const ax = await axiosBuilder('cdurning2@desdev.cn')
  await ax.put('/api/v1/settings/user/cdurning2', { webhooks: [{ type: 'dataset', title: 'test', events: ['finalize-end'], url: 'http://localhost:5900' }] })
  let form = new FormData()
  form.append('file', fs.readFileSync('./test/resources/Antennes du CD22.csv'), 'Antennes du CD22.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  const webhook = await eventToPromise(notifier, 'webhook')
  res = await ax.get(webhook.href + '/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
  const datasetId = webhook.href.split('/').pop()
  // testing journal, updating data and then journal length again
  wsCli.send(JSON.stringify({ type: 'subscribe', channel: 'datasets/' + datasetId + '/journal' }))
  res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
  t.is(res.status, 200)
  t.is(res.data.length, 9)
  form = new FormData()
  form.append('file', fs.readFileSync('./test/resources/Antennes du CD22.csv'), 'Antennes du CD22.csv')
  res = await ax.post(webhook.href, form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 200)
  const wsRes = await eventToPromise(wsCli, 'message')
  t.is(JSON.parse(wsRes.data).channel, 'datasets/' + datasetId + '/journal')
  await eventToPromise(notifier, 'webhook')
  res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
  t.is(res.data.length, 18)
  // testing permissions
  const ax1 = await axiosBuilder('dmeadus0@answers.com')
  try {
    await ax1.get(webhook.href)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  const ax2 = await axiosBuilder()
  try {
    await ax2.get(webhook.href)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  // Updating schema
  res = await ax.get(webhook.href)
  const schema = res.data.schema
  schema.find(field => field.key === 'lat')['x-refersTo'] = 'http://schema.org/latitude'
  schema.find(field => field.key === 'lon')['x-refersTo'] = 'http://schema.org/longitude'
  await ax.patch(webhook.href, { schema: schema })
  await eventToPromise(notifier, 'webhook')
  // Delete the dataset
  res = await ax.delete('/api/v1/datasets/' + datasetId)
  t.is(res.status, 204)
  try {
    await ax.get('/api/v1/datasets/' + datasetId)
  } catch (err) {
    t.is(err.status, 404)
  }
})
