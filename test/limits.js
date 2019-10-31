const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const { test, axiosBuilder, config } = testUtils.prepare(__filename)

test.serial('Manage a user storage limit', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')

  // Just fill up al little
  let form = new FormData()
  form.append('file', Buffer.alloc(15000), 'dataset.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)

  // Send dataset applying default limits
  form = new FormData()
  form.append('file', Buffer.alloc(10000), 'dataset.csv')
  try {
    res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 429)
  }

  // define a higher limit
  res = await ax.post('/api/v1/limits/user/dmeadus0', { storage: 30000 }, { params: { key: config.secretKeys.limits } })
  form = new FormData()
  form.append('file', Buffer.alloc(10000), 'dataset.csv')
  res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  form = new FormData()
  form.append('file', Buffer.alloc(10000), 'dataset.csv')
  try {
    res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    t.fail()
  } catch (err) {
    t.is(err.status, 429)
  }

  // Get the stored limit and consumption
  res = await ax.get('/api/v1/limits/user/dmeadus0')
  t.is(res.status, 200)
  t.is(res.data.storage, 30000)
  t.is(res.data.consumption.storage, 25000)
})

test.serial('A user cannot change limits', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  try {
    await ax.post('/api/v1/limits/user/dmeadus0', { storage: 30000 })
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
})

test.serial('A user can read his limits', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  await ax.post('/api/v1/limits/user/dmeadus0', { storage: 30000 }, { params: { key: config.secretKeys.limits } })
  const res = await ax.get('/api/v1/limits/user/dmeadus0')
  t.is(res.status, 200)
  t.is(res.data.storage, 30000)
})

test.serial('A user cannot read the list of limits', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  try {
    await ax.get('/api/v1/limits')
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
})

test.serial('A super admin can the list of limits', async t => {
  const ax = await axiosBuilder('alban.mouton@koumoul.com')
  await ax.post('/api/v1/limits/user/dmeadus0', { storage: 30000 }, { params: { key: config.secretKeys.limits } })
  const res = await ax.get('/api/v1/limits')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
  t.is(res.data.results.length, 1)
  t.is(res.data.results[0].id, 'dmeadus0')
  t.is(res.data.results[0].type, 'user')
})
