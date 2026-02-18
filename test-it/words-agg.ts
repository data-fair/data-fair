import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset } from './utils/index.ts'
import * as workers from '../api/src/workers/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('words aggs', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get words buckets', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: [{ key: 'adr', type: 'string', 'x-capabilities': { textAgg: true } }] })
    await workers.hook(`finalize/${dataset.id}`)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/words_agg?field=adr`)
    assert.equal(res.data.total, 2) // Number of items
    assert.ok(res.data.results.find(r => r.word === 'adresse'))
  })
})
