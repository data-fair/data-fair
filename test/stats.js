import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import fs from 'node:fs'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'

describe('stats', function () {
  it('Get simple stats', async function () {
    const ax = global.ax.dmeadus
    const datasetData = fs.readFileSync('./resources/datasets/dataset1.csv')
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
