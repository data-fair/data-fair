const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')



const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

it('Check secret key', async () => {
  const ax = await global.ax.builder()
  try {
    await ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } })
  } catch (err) {
    assert.equal(err.status, 403)
  }
})

it('Upload new dataset in user zone', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset1.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  assert.equal(res.status, 201)
  const datasetId = res.data.id
  assert.equal(res.data.owner.name, 'Danna Meadus')
  res = await ax.post(`/api/v1/identities/user/${res.data.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
  assert.equal(res.status, 200)
  res = await ax.get(`/api/v1/datasets/${datasetId}`)
  assert.equal(res.data.owner.name, 'Another Name')
})
