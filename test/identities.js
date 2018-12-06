const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const { test, config, axiosBuilder } = testUtils.prepare(__filename)

const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

test('Check secret key', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.post(`/api/v1/identities/user/test`, { name: 'Another Name' }, { params: { key: 'bad key' } })
  } catch (err) {
    t.is(err.status, 403)
  }
})

test.serial('Upload new dataset in user zone', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  const datasetId = res.data.id
  t.is(res.data.owner.name, 'Danna Meadus')
  res = await ax.post(`/api/v1/identities/user/${res.data.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
  t.is(res.status, 200)
  res = await ax.get(`/api/v1/datasets/${datasetId}`)
  t.is(res.data.owner.name, 'Another Name')
})
