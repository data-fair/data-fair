const fs = require('fs')
const FormData = require('form-data')
const eventToPromise = require('event-to-promise')
const WebSocket = require('ws')
const testUtils = require('./resources/test-utils')
const { test, config, axiosBuilder } = testUtils.prepare(__filename)
const workers = require('../server/workers')

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

test('Get datasets with special param as super admin', async t => {
  const ax = await axiosBuilder('alone@no.org')
  try {
    await ax.get('/api/v1/datasets', { params: { showAll: true } })
  } catch (err) {
    t.is(err.status, 400)
  }
  const axAdmin = await axiosBuilder('alban.mouton@koumoul.com')
  const res = await axAdmin.get('/api/v1/datasets', { params: { showAll: true } })
  t.is(res.status, 200)
  t.true(res.data.count > 0)
})

test.serial('Search and apply facets', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')

  // 1 dataset in user zone
  await testUtils.sendDataset('dataset1.csv', ax)
  // 2 datasets in organization zone
  await testUtils.sendDataset('dataset1.csv', ax, 'KWqAGZ4mG')
  await testUtils.sendDataset('dataset1.csv', ax, 'KWqAGZ4mG')

  let res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type' } })
  t.is(res.data.count, 3)
  t.is(res.data.facets.owner.length, 2)
  t.is(res.data.facets.owner[0].count, 2)
  t.is(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
  t.is(res.data.facets.owner[1].count, 1)
  t.is(res.data.facets['field-type'].length, 2)
  t.is(res.data.facets['field-type'][0].count, 3)

  res = await ax.get('/api/v1/datasets', { params: {
    owner: 'organization:KWqAGZ4mG',
    facets: 'owner,field-type'
  } })
  t.is(res.data.count, 2)
  t.is(res.data.facets.owner.length, 2)
  // owner facet is not affected by the owner filter
  t.is(res.data.facets.owner[0].count, 2)
  t.is(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
  t.is(res.data.facets.owner[1].count, 1)
  // field-type facet is affected by the owner filter
  t.is(res.data.facets['field-type'].length, 2)
  t.is(res.data.facets['field-type'][0].count, 2)
})

const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

test.serial('Failure to upload dataset exceeding limit', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', Buffer.alloc(16000), 'largedataset.csv')
  try {
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 413)
  }
})

test.serial('Failure to upload multiple datasets exceeding limit', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
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

test.serial('Upload new dataset in user zone', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  t.is(res.data.owner.type, 'user')
  t.is(res.data.owner.id, 'dmeadus0')
  t.is(res.data.file.encoding, 'UTF-8')
})

test.serial('Upload new dataset in user zone with title', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  form.append('title', 'My title')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  t.is(res.data.id, 'my-title')
  t.is(res.data.title, 'My title')
})

test.serial('Upload new dataset in organization zone', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset2.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
  t.is(res.status, 201)
  t.is(res.data.owner.type, 'organization')
  t.is(res.data.owner.id, 'KWqAGZ4mG')
})

test.serial('Uploading same file twice should increment id', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  for (let i of [1, 2, 3]) {
    const form = new FormData()
    form.append('file', datasetFd, 'my-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
    t.is(res.status, 201)
    t.is(res.data.id, 'my-dataset' + (i === 1 ? '' : i))
  }
})

test.serial('Upload new dataset with pre-filled attributes', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('title', 'A dataset with pre-filled title')
  form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
  form.append('file', datasetFd, 'yet-a-dataset.csv')
  const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
  t.is(res.data.title, 'A dataset with pre-filled title')
})

test.serial('Upload new dataset with defined id', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let form = new FormData()
  form.append('title', 'my title')
  form.append('file', datasetFd, 'yet-a-dataset.csv')
  let res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  t.is(res.data.title, 'my title')
  t.is(res.data.id, 'my-dataset-id')
  await workers.hook('finalizer/my-dataset-id')
  form = new FormData()
  form.append('title', 'my other title')
  form.append('file', datasetFd, 'yet-a-dataset.csv')
  res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 200)
})

test('Reject some other pre-filled attributes', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('id', 'pre-filling ig is not possible')
  form.append('file', datasetFd, 'yet-a-dataset.csv')
  try {
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
  } catch (err) {
    t.is(err.status, 400)
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

test.serial('Upload dataset - full test with webhooks', async t => {
  const wsCli = new WebSocket(config.publicUrl)
  const ax = await axiosBuilder('cdurning2@desdev.cn:passwd')
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

  // Send again the data to the same dataset
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
  const ax1 = await axiosBuilder('dmeadus0@answers.com:passwd')
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
