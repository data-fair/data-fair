import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import FormData from 'form-data'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'

// run this test manually with "DEBUG=workers WORKER_CONCURRENCY=4 DEFAULT_LIMITS_DATASET_STORAGE=10000000 npm test"

describe.skip('concurrency', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Upload datasets in parallel', async function () {
    this.timeout(120000)

    const ax = dmeadus

    // define a higher limit
    await ax.post('/api/v1/limits/user/dmeadus0', {
      store_bytes: { limit: 100000000, consumption: 0 },
      lastUpdate: new Date().toISOString()
    }, { params: { key: config.secretKeys.limits } })

    const sendDataset = async (i) => {
      let csv = `${i}_field1,${i}_field2,${i}_field3,${i}_field4,${i}_field5\n`
      for (let j = 0; j < 50000; j++) {
        csv += `"field1${i}${j % 4}","field2${i}${j % 4}","field3${i}${j % 4}","field4${i}${j % 4}","field5${i}${j % 4}"\n`
      }
      const form = new FormData()
      form.append('file', csv, 'dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
      assert.equal(res.status, 201)
      return workers.hook(`finalize/${res.data.id}`)
    }

    const promises = []
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      promises.push(sendDataset(i))
    }
    const datasets = await Promise.all(promises)
    console.log(datasets.map(d => ({ id: d.id, status: d.status, count: d.count })))
  })
})
