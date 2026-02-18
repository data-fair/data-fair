import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'

describe('stats', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get simple stats', async function () {
    const ax = dmeadus
    const datasetData = fs.readFileSync('./resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetData, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    await workers.hook(`finalize/${res.data.id}`)
    assert.equal(res.status, 201)

    res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.limits.store_bytes.limit > 0)
  })
})
