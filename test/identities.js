const assert = require('assert').strict
const fs = require('fs-extra')
const path = require('path')
const FormData = require('form-data')
const config = require('config')
const testUtils = require('./resources/test-utils')

const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')

describe('identities', () => {
  it('Check secret key', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('Propagate name change to a dataset', async () => {
    const ax = global.ax.dmeadus
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

  it('Delete an identity completely', async () => {
    const ax = global.ax.icarlens9
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const datasetId = res.data.id
    assert.equal(res.data.owner.name, 'Issie Carlens')
    const userDir = path.join(config.dataDir, 'user', 'icarlens9')
    assert.ok(await fs.exists(userDir))
    res = await ax.delete('/api/v1/identities/user/icarlens9', { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    try {
      await ax.get(`/api/v1/datasets/${datasetId}`)
    } catch (err) {
      assert.equal(err.status, 404)
    }
    assert.ok(!await fs.exists(userDir))
  })
})
