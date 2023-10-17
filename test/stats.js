const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('stats', () => {
  it('Get simple stats', async () => {
    const ax = global.ax.dmeadus
    const datasetData = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetData, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    await workers.hook(`finalizer/${res.data.id}`)
    assert.equal(res.status, 201)

    res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.limits.store_bytes.limit > 0)
  })
})
